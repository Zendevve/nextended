import { CollectionModFile, DownloadMethod } from '../../../common/types';
import { StorageManager } from '../../../common/storage';
import { SingleDownloader } from '../singleDownloader';
import { RateLimiter } from '../rateLimiter';
import { GraphQLClient } from '../graphQLClient';
import { ProgressBarComponent, ProgressBarStatus } from './components/progressBar';
import { LogConsoleComponent, LogType } from './components/logConsole';
import { CollectionToolbarComponent } from './components/collectionToolbar';

export class CollectionEngine {
  element: HTMLElement;
  domainName: string;
  collectionSlug: string;
  revisionNumber: number | null;

  mods: {
    all: CollectionModFile[];
    mandatory: CollectionModFile[];
    optional: CollectionModFile[];
  } = { all: [], mandatory: [], optional: [] };

  private toolbar!: CollectionToolbarComponent;
  private progressBar!: ProgressBarComponent;
  private console!: LogConsoleComponent;

  constructor(domainName: string, collectionSlug: string, revisionNumber: number | null = null) {
    this.domainName = domainName;
    this.collectionSlug = collectionSlug;
    this.revisionNumber = revisionNumber;

    this.element = document.createElement('div');
    this.element.id = 'nextended-collection-container';
    this.element.className = 'bg-surface-low w-full space-y-3 rounded-lg p-4 mt-4 text-white';

    this.progressBar = new ProgressBarComponent();
    this.console = new LogConsoleComponent();
  }

  async init() {
    this.element.innerHTML = `
      <div class="w-full text-center py-2 text-xs font-semibold text-neutral-moderate uppercase tracking-wider">
        Fetching Collection Details via Nexus GraphQL...
      </div>
    `;

    const data = await GraphQLClient.fetchCollectionMods(this.collectionSlug, this.revisionNumber);
    if (!data || !data.modFiles || data.modFiles.length === 0) {
      this.element.innerHTML = `
        <div class="w-full text-center py-2 text-xs font-semibold text-red-400 uppercase tracking-wider">
          Failed to fetch mods for collection "${this.collectionSlug}".
        </div>
      `;
      return;
    }

    const sorted = data.modFiles.sort((a, b) => a.file.mod.name.localeCompare(b.file.mod.name));
    const mandatory = sorted.filter((m) => !m.optional);
    const optional = sorted.filter((m) => m.optional);

    this.mods = {
      all: [...mandatory, ...optional],
      mandatory,
      optional
    };

    this.toolbar = new CollectionToolbarComponent(
      this.domainName,
      this.collectionSlug,
      this.mods,
      (modsToDownload, typeKey) => {
        this.startBatchDownload(modsToDownload, typeKey);
      }
    );

    this.element.innerHTML = '';
    this.element.appendChild(this.toolbar.element);
    this.element.appendChild(this.progressBar.element);
    this.element.appendChild(this.console.element);
  }

  private async delay(ms: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    return promise;
  }

  async startBatchDownload(mods: CollectionModFile[], typeKey: 'all' | 'mandatory' | 'optional') {
    const config = await StorageManager.getConfig();
    const history = await StorageManager.getHistory();

    this.toolbar.element.style.display = 'none';
    this.progressBar.element.style.display = '';
    this.progressBar.setModsCount(mods.length);
    this.progressBar.setProgress(0);
    this.progressBar.setStatus(ProgressBarStatus.DOWNLOADING);

    this.console.log(`Starting batch download of ${mods.length} mods...`, LogType.INFO);

    const alreadyDownloaded = history[this.domainName]?.[this.collectionSlug]?.[typeKey] || [];
    const failedMods: CollectionModFile[] = [];

    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      const indexStr = `${(i + 1).toString().padStart(mods.length.toString().length, '0')}/${mods.length}`;

      if (this.progressBar.status === ProgressBarStatus.STOPPED) {
        this.console.log('Batch download aborted by user.', LogType.INFO);
        break;
      }

      if (alreadyDownloaded.includes(mod.fileId)) {
        this.console.log(`[${indexStr}] Already downloaded: ${mod.file.name}`, LogType.INFO);
        this.progressBar.incrementProgress();
        continue;
      }

      if (this.progressBar.skipTo) {
        if (this.progressBar.skipToIndex - 1 > i) {
          this.console.log(`[${indexStr}] Skipping: ${mod.file.name}`);
          this.progressBar.incrementProgress();
          continue;
        }
        this.progressBar.skipTo = false;
      }

      // Check Rate Limit Rolling Window
      const rateLimitCheck = await RateLimiter.registerDownload();
      if (rateLimitCheck.requiresCooldown) {
        this.console.log(`Reached 200 downloads cap. Waiting 5 minutes to prevent account suspension...`, LogType.INFO);
        let remain = rateLimitCheck.waitTimeSec;
        while (remain > 0) {
          if (this.progressBar.status === ProgressBarStatus.STOPPED) break;
          this.console.log(`Cooldown remaining: ${Math.floor(remain / 60)}m ${remain % 60}s...`);
          await this.delay(1000);
          remain--;
        }
      }

      // Resolve URL
      const isNMM = config.downloadMethod === DownloadMethod.VORTEX;
      const res = await SingleDownloader.resolveDownloadUrl({
        fileId: mod.fileId.toString(),
        gameId: mod.file.mod.game.id.toString(),
        isNMM,
        href: mod.file.url
      });

      if (!res.url || res.error) {
        this.console.log(`[${indexStr}] Failed to resolve URL for: ${mod.file.name}`, LogType.ERROR);
        failedMods.push(mod);
      } else {
        if (isNMM || res.url.startsWith('nxm://')) {
          this.console.log(`[${indexStr}] Sent to Vortex: ${mod.file.name}`);
          location.href = res.url;
        } else {
          this.console.log(`[${indexStr}] Downloading: ${mod.file.name}`);
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ type: 'TRIGGER_DOWNLOAD', url: res.url, filename: mod.file.name });
          } else {
            const a = document.createElement('a');
            a.href = res.url;
            a.download = mod.file.name;
            a.click();
          }
        }

        // Update history
        history[this.domainName] ??= {};
        history[this.domainName][this.collectionSlug] ??= { all: [], mandatory: [], optional: [] };
        history[this.domainName][this.collectionSlug][typeKey] = [
          ...new Set([...history[this.domainName][this.collectionSlug][typeKey], mod.fileId])
        ];
        await StorageManager.setHistory(history);
      }

      this.progressBar.incrementProgress();

      // Pause calculation between downloads
      if (i < mods.length - 1 && this.progressBar.status !== ProgressBarStatus.STOPPED) {
        const pauseSec = RateLimiter.calculateFilePause(
          mod.file.size,
          config.downloadSpeedMb,
          config.pauseBetweenDownloadSec
        );

        let pauseRemaining = pauseSec;
        while (pauseRemaining > 0) {
          if (this.progressBar.skipPause || this.progressBar.skipTo || this.progressBar.status === ProgressBarStatus.STOPPED) {
            this.progressBar.skipPause = false;
            break;
          }
          if (this.progressBar.status === ProgressBarStatus.PAUSED) {
            await this.delay(200);
            continue;
          }
          await this.delay(1000);
          pauseRemaining--;
        }
      }
    }

    this.progressBar.setStatus(ProgressBarStatus.FINISHED);
    this.console.log(
      `Batch finished. Completed with ${failedMods.length} errors.`,
      failedMods.length > 0 ? LogType.ERROR : LogType.INFO
    );

    setTimeout(() => {
      this.progressBar.element.style.display = 'none';
      this.toolbar.element.style.display = '';
    }, 4000);
  }
}
