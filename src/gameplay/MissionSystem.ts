export interface Mission {
  id: number;
  type: 'destroy' | 'deliver';
  title: string;
  description: string;
  reward: number;
  progress: number;  // current kills or 0/1 for delivery
  target: number;    // required kills or 1 for delivery
  completed: boolean;
  cargo?: string;    // for delivery
}

export class MissionSystem {
  private nextId = 1;

  generateMissions(): Mission[] {
    const missions: Mission[] = [];
    const count = 2 + Math.floor(Math.random() * 3); // 2-4 missions

    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.5) {
        missions.push(this.generateDestroyMission());
      } else {
        missions.push(this.generateDeliveryMission());
      }
    }
    return missions;
  }

  private generateDestroyMission(): Mission {
    const kills = 2 + Math.floor(Math.random() * 4); // 2-5 kills
    const reward = kills * (200 + Math.floor(Math.random() * 150));
    const names = ['пиратов', 'налётчиков', 'контрабандистов', 'мародёров', 'рейдеров'];
    const name = names[Math.floor(Math.random() * names.length)];
    return {
      id: this.nextId++,
      type: 'destroy',
      title: `Охота на ${name}`,
      description: `Уничтожьте ${kills} ${name} в системе.`,
      reward,
      progress: 0,
      target: kills,
      completed: false,
    };
  }

  private generateDeliveryMission(): Mission {
    const reward = 300 + Math.floor(Math.random() * 700);
    const cargos = ['Медикаменты', 'Запчасти', 'Продовольствие', 'Топливо', 'Электроника'];
    const cargo = cargos[Math.floor(Math.random() * cargos.length)];
    const stations = ['Орбитальный док', 'Шахтёрский аванпост', 'Торговый узел', 'Форпост'];
    const dest = stations[Math.floor(Math.random() * stations.length)];
    return {
      id: this.nextId++,
      type: 'deliver',
      title: `Доставка груза`,
      description: `Доставьте "${cargo}" на ${dest}.`,
      reward,
      progress: 0,
      target: 1,
      completed: false,
      cargo,
    };
  }
}
