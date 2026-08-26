export enum ProgressBarStatus {
  DOWNLOADING = 0,
  PAUSED = 1,
  FINISHED = 2,
  STOPPED = 3
}

export class ProgressBarComponent {
  element: HTMLElement;
  modsCount = 0;
  progress = 0;
  skipPause = false;
  skipTo = false;
  skipToIndex = 0;
  status: ProgressBarStatus = ProgressBarStatus.DOWNLOADING;

  private progressBarFill!: HTMLElement;
  private progressBarProgress!: HTMLElement;
  private progressBarTextCenter!: HTMLElement;
  private progressBarTextRight!: HTMLElement;
  private playPauseBtn!: HTMLElement;
  private stopBtn!: HTMLElement;
  private skipNextBtn!: HTMLElement;
  private skipToIndexBtn!: HTMLElement;
  private skipToIndexInput!: HTMLInputElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'nextended-progress-bar flex flex-wrap w-full';
    this.element.style.display = 'none';
    this.renderInitialHTML();
  }

  private renderInitialHTML() {
    this.element.innerHTML = `
      <div class="flex-1 relative w-full min-h-9 bg-surface-mid rounded-l overflow-hidden" id="progressBar">
        <div class="absolute top-0 left-0 w-0 h-full bg-primary-moderate" style="transition: width 0.3s ease 0s; width: 0%;" id="progressBarFill"></div>
        <div class="absolute top-0 left-0 w-full h-full cursor-pointer grid grid-cols-3 items-center text-white font-montserrat font-semibold text-sm leading-none tracking-wider uppercase" id="progressBarText">
          <div class="ml-2" id="progressBarProgress">0.00%</div>
          <div class="text-center" id="progressBarTextCenter">Downloading...</div>
          <div class="text-right mr-2" id="progressBarTextRight">0/0</div>
        </div>
      </div>
      <div class="flex" id="actionBtnGroup">
        <button class="font-montserrat font-semibold text-sm uppercase px-3 py-1 cursor-pointer bg-primary-moderate text-white hover:bg-primary-subdued flex items-center justify-center" id="playPauseBtn" title="Pause / Resume">
          ⏸️
        </button>
        <button class="font-montserrat font-semibold text-sm uppercase px-3 py-1 cursor-pointer bg-primary-moderate text-white hover:bg-primary-subdued flex items-center justify-center rounded-r" id="stopBtn" title="Stop Download">
          ⏹️
        </button>
      </div>
      <div class="flex my-2 justify-between w-full items-center" id="skipContainer">
        <div class="flex gap-2 items-center">
          <button class="rounded font-montserrat font-semibold text-xs uppercase px-2 py-1 cursor-pointer bg-primary-moderate text-white hover:bg-primary-subdued" id="skipNextBtn">
            Skip pause
          </button>
          <button class="rounded font-montserrat font-semibold text-xs uppercase px-2 py-1 cursor-pointer bg-primary-moderate text-white hover:bg-primary-subdued" id="skipToIndexBtn">
            Skip to index
          </button>
          <input class="text-sm bg-surface-mid text-white rounded border border-neutral-moderate px-1 w-16" type="number" min="0" placeholder="Index" id="skipToIndexInput">
        </div>
      </div>
    `;

    this.progressBarFill = this.element.querySelector('#progressBarFill') as HTMLElement;
    this.progressBarProgress = this.element.querySelector('#progressBarProgress') as HTMLElement;
    this.progressBarTextCenter = this.element.querySelector('#progressBarTextCenter') as HTMLElement;
    this.progressBarTextRight = this.element.querySelector('#progressBarTextRight') as HTMLElement;
    this.playPauseBtn = this.element.querySelector('#playPauseBtn') as HTMLElement;
    this.stopBtn = this.element.querySelector('#stopBtn') as HTMLElement;
    this.skipNextBtn = this.element.querySelector('#skipNextBtn') as HTMLElement;
    this.skipToIndexBtn = this.element.querySelector('#skipToIndexBtn') as HTMLElement;
    this.skipToIndexInput = this.element.querySelector('#skipToIndexInput') as HTMLInputElement;

    this.playPauseBtn.addEventListener('click', () => {
      this.setStatus(
        this.status === ProgressBarStatus.DOWNLOADING ? ProgressBarStatus.PAUSED : ProgressBarStatus.DOWNLOADING
      );
    });

    this.stopBtn.addEventListener('click', () => {
      this.setStatus(ProgressBarStatus.STOPPED);
    });

    this.skipNextBtn.addEventListener('click', () => {
      this.skipPause = true;
      this.setStatus(ProgressBarStatus.DOWNLOADING);
    });

    this.skipToIndexBtn.addEventListener('click', () => {
      const idx = Number.parseInt(this.skipToIndexInput.value, 10);
      if (idx > this.progress && idx <= this.modsCount) {
        this.skipTo = true;
        this.skipToIndex = idx;
        this.setStatus(ProgressBarStatus.DOWNLOADING);
      }
    });
  }

  setModsCount(count: number) {
    this.modsCount = count;
    this.render();
  }

  setProgress(prog: number) {
    this.progress = prog;
    this.render();
  }

  incrementProgress() {
    this.progress++;
    this.render();
  }

  setStatus(status: ProgressBarStatus) {
    this.status = status;
    const statusLabels: Record<ProgressBarStatus, string> = {
      [ProgressBarStatus.DOWNLOADING]: 'Downloading...',
      [ProgressBarStatus.PAUSED]: 'Paused',
      [ProgressBarStatus.FINISHED]: 'Finished',
      [ProgressBarStatus.STOPPED]: 'Stopped'
    };
    this.progressBarTextCenter.innerHTML = statusLabels[status];
    this.playPauseBtn.innerHTML = status === ProgressBarStatus.PAUSED ? '▶️' : '⏸️';
  }

  private getPercent(): string {
    if (this.modsCount === 0) return '0.00';
    return ((this.progress / this.modsCount) * 100).toFixed(2);
  }

  render() {
    const percent = this.getPercent();
    if (this.progressBarFill) this.progressBarFill.style.width = `${percent}%`;
    if (this.progressBarProgress) this.progressBarProgress.innerHTML = `${percent}%`;
    if (this.progressBarTextRight) this.progressBarTextRight.innerHTML = `${this.progress}/${this.modsCount}`;
  }
}
