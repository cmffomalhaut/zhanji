import { onMounted, watch, ref } from 'vue';
import type { StatData } from './types';

function isEncounterPending(data: StatData): boolean {
  const phase = data.世界.剧情状态;
  return (phase === '战斗' || phase === '偷袭') && data.战斗状态 === null;
}

function triggerButton(name: string): void {
  emitEvent(getButtonEvent(name));
}

export function useAutoBattle(store: { data: StatData }) {
  const hasHandled = ref(false);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  onMounted(() => {
    const data = store.data;
    if (isEncounterPending(data) && !hasHandled.value) {
      hasHandled.value = true;

      setTimeout(() => {
        triggerButton('开始战斗');
      }, 300);
    }
  });

  watch(
    () => store.data.战斗状态,
    (battleState) => {
      if (!hasHandled.value) return;

      if (battleState?.状态 === 'ended') {
        triggerButton('战斗结算');
      }

      if (battleState === null) {
        closeTimer = setTimeout(() => {
          const shell = document.querySelector('.battle-shell') as HTMLElement;
          if (shell) {
            shell.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            shell.style.opacity = '0';
            shell.style.transform = 'translateY(-12px)';
            setTimeout(() => {
              shell.style.display = 'none';
            }, 600);
          }
          hasHandled.value = false;
        }, 2000);
      }
    },
  );

  return () => {
    if (closeTimer) clearTimeout(closeTimer);
  };
}
