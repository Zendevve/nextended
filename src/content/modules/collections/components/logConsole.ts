export enum LogType {
  NORMAL = 'NORMAL',
  ERROR = 'ERROR',
  INFO = 'INFO'
}

export class LogConsoleComponent {
  element: HTMLElement;
  private logContainer!: HTMLElement;
  private toggleBtn!: HTMLElement;
  private isHidden = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'nextended-log-console flex flex-col w-full gap-2 mt-3';
    this.renderInitialHTML();
  }

  private renderInitialHTML() {
    this.element.innerHTML = `
      <div class="flex flex-col w-full gap-2">
        <button class="w-full font-montserrat font-semibold text-xs leading-none tracking-wider uppercase py-1 bg-surface-mid text-neutral-moderate border border-neutral-moderate rounded cursor-pointer hover:text-white" id="toggleLogsBtn">
          Hide logs
        </button>
        <div class="w-full bg-surface-low rounded overflow-y-auto text-white text-xs p-2 border border-stroke-subdued" style="height: 8rem; font-family: monospace;" id="logContainer">
        </div>
      </div>
    `;

    this.logContainer = this.element.querySelector('#logContainer') as HTMLElement;
    this.toggleBtn = this.element.querySelector('#toggleLogsBtn') as HTMLElement;

    this.toggleBtn.addEventListener('click', () => {
      this.isHidden = !this.isHidden;
      this.logContainer.style.display = this.isHidden ? 'none' : '';
      this.toggleBtn.innerHTML = this.isHidden ? 'Show logs' : 'Hide logs';
    });
  }

  log(message: string, type: LogType = LogType.NORMAL): HTMLElement {
    const row = document.createElement('div');
    row.className = 'flex gap-1 py-0.5 items-center';

    if (type === LogType.ERROR) {
      row.classList.add('text-danger-moderate');
      row.style.color = '#ef4444';
    } else if (type === LogType.INFO) {
      row.classList.add('text-info-moderate');
      row.style.color = '#0ea5e9';
    }

    const time = new Date().toLocaleTimeString();
    row.innerHTML = `<span style="opacity: 0.7;">[${time}]</span> <span class="log-msg">${message}</span>`;

    this.logContainer.appendChild(row);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
    return row;
  }

  clear() {
    this.logContainer.innerHTML = '';
  }
}
