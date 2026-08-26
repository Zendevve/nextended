import { StorageManager } from '../../common/storage';

export class RequirementsBypass {
  private static attached = false;

  static isRequirementsUrl(href: string): boolean {
    return /ModRequirementsPopUp|tab=requirements/i.test(href);
  }

  static attach() {
    if (this.attached) return;
    this.attached = true;

    document.body.addEventListener(
      'click',
      async (e: MouseEvent) => {
        if (!e.isTrusted || e.defaultPrevented) return;
        const config = await StorageManager.getConfig();
        if (!config.skipRequirements) return;

        const path = e.composedPath ? e.composedPath() : [e.target as EventTarget];
        const link = (path.find((n) => (n as HTMLElement)?.tagName === 'A') ||
          (e.target as HTMLElement).closest('a')) as HTMLAnchorElement | null;

        if (!link || !link.href) return;

        if (link.href.includes('tab=requirements')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          location.replace(link.href.replace('tab=requirements', 'tab=files'));
        }
      },
      true
    );
  }
}
