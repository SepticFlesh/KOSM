/**
 * Server-side mission system.
 * Generates destroy/deliver missions per player.
 */

export interface Mission {
  id: number;
  type: 'destroy' | 'deliver';
  title: string;
  description: string;
  reward: number;
  progress: number;
  target: number;
  completed: boolean;
}

const DESTROY_TEMPLATES = [
  { title: 'Угроза пиратов', desc: 'Уничтожьте пиратов в системе.', target: 2, reward: 500 },
  { title: 'Зачистка сектора', desc: 'Пиратская активность зашкаливает.', target: 3, reward: 800 },
  { title: 'Охотник за головами', desc: 'Опасный пиратский главарь.', target: 5, reward: 1500 },
  { title: 'Патруль', desc: 'Рутинное патрулирование.', target: 1, reward: 250 },
];

const DELIVER_TEMPLATES = [
  { title: 'Срочная доставка', desc: 'Доставьте груз в другую систему.', target: 1, reward: 300 },
  { title: 'Торговый контракт', desc: 'Перевезите товары.', target: 1, reward: 450 },
  { title: 'Контрабанда', desc: 'Доставьте запрещённый груз.', target: 1, reward: 800 },
];

let missionIdCounter = 1000;

export class ServerMissionSystem {
  /** Generate 3-4 missions for a player */
  generateMissions(systemSeed: number): Mission[] {
    const missions: Mission[] = [];
    const count = 3 + Math.floor(Math.random() * 2);

    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.6) {
        // Destroy mission
        const tpl = DESTROY_TEMPLATES[Math.floor(Math.random() * DESTROY_TEMPLATES.length)];
        missions.push({
          id: ++missionIdCounter,
          type: 'destroy',
          title: tpl.title,
          description: tpl.desc,
          reward: tpl.reward + Math.floor(Math.random() * 200),
          progress: 0,
          target: tpl.target,
          completed: false,
        });
      } else {
        // Deliver mission
        const tpl = DELIVER_TEMPLATES[Math.floor(Math.random() * DELIVER_TEMPLATES.length)];
        missions.push({
          id: ++missionIdCounter,
          type: 'deliver',
          title: tpl.title,
          description: tpl.desc,
          reward: tpl.reward + Math.floor(Math.random() * 200),
          progress: 0,
          target: tpl.target,
          completed: false,
        });
      }
    }
    return missions;
  }

  /** Update destroy mission progress for a player who killed NPCs */
  updateKillProgress(missions: Mission[], killCount: number): { completed: Mission[]; remaining: Mission[] } {
    const completed: Mission[] = [];
    const remaining: Mission[] = [];

    for (const m of missions) {
      if (m.type === 'destroy' && !m.completed) {
        m.progress += killCount;
        if (m.progress >= m.target) {
          m.completed = true;
          completed.push(m);
        } else {
          remaining.push(m);
        }
      } else {
        remaining.push(m);
      }
    }

    return { completed, remaining };
  }

  /** Complete a deliver mission */
  completeDelivery(missions: Mission[], missionId: number): { success: boolean; reward?: number } {
    const m = missions.find(m => m.id === missionId && m.type === 'deliver' && !m.completed);
    if (!m) return { success: false };

    m.completed = true;
    m.progress = m.target;
    return { success: true, reward: m.reward };
  }
}
