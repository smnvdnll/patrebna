import { describe, it, expect } from 'vitest';
import 'config/i18n/i18n';
import ru from './ru';
import by from './by';
import keyboards from 'bot/keyboards';

describe('i18n locales parity', () => {
  it('ru and by have matching keys', () => {
    const ruKeys = Object.keys(ru.translations).sort();
    const byKeys = Object.keys(by.translations).sort();

    const missingInBy = ruKeys.filter((k) => !byKeys.includes(k));
    const missingInRu = byKeys.filter((k) => !ruKeys.includes(k));

    expect(missingInBy).toEqual([]);
    expect(missingInRu).toEqual([]);
  });

  it('contains all required keys for bot status', () => {
    const requiredKeys = [
      'Статус', 'Статус бота', 'В базе', 'За сегодня',
      'новых объявлений', 'уведомлений', 'Ваши треды', 'активных', '—',
    ];

    for (const key of requiredKeys) {
      expect(ru.translations).toHaveProperty(key);
      expect(by.translations).toHaveProperty(key);
    }
  });

  it('Main keyboard includes the Status button on the third row', () => {
    const mainKb = keyboards.Main();
    expect(mainKb.keyboard).toHaveLength(3);
    expect(mainKb.keyboard[2]).toEqual([{ text: '🛠 Статус' }]);
  });
});
