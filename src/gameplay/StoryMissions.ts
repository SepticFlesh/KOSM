import type { Mission } from './MissionSystem';

export interface StoryStep {
  id: string;
  title: string;
  description: string;
  type: 'destroy' | 'deliver';
  target: number;
  reward: number;
  systemHint?: string;
}

const STORY: StoryStep[] = [
  {
    id: 'story_1',
    title: 'SOS: Сигнал бедствия',
    description: 'Торговый корабль атакован пиратами. Уничтожьте 2 пиратов в системе.',
    type: 'destroy', target: 2, reward: 500,
  },
  {
    id: 'story_2',
    title: 'Тёмные делишки',
    description: 'Доставьте контрабандный груз в другую систему (прыгните в соседнюю).',
    type: 'deliver', target: 1, reward: 800,
  },
  {
    id: 'story_3',
    title: 'Логово пиратов',
    description: 'Пиратский главарь скрывается в системе. Уничтожьте 3 пиратов чтобы выманить его.',
    type: 'destroy', target: 3, reward: 1200,
  },
  {
    id: 'story_4',
    title: 'Триумф',
    description: 'Вернитесь на любую станцию за наградой. Вы — герой системы!',
    type: 'deliver', target: 1, reward: 2000,
  },
];

export function getStoryStep(index: number): StoryStep | null {
  return STORY[index] || null;
}

export function createStoryMission(step: StoryStep, missionId: number): Mission {
  return {
    id: missionId,
    type: step.type,
    title: step.title,
    description: step.description,
    reward: step.reward,
    progress: 0,
    target: step.target,
    completed: false,
  };
}
