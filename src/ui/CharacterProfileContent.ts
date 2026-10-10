import { CharacterDNA, traitKeys, heritageKeys } from '../characters/CharacterDNA';
import { characterName } from '../characters/naming/generateName';
import { heritageLabels } from '../characters/heritageProfiles';
/** One profile content renderer for Fjordside and canonical residents. Stored names take precedence. */
export function renderCharacterProfile(card: HTMLElement, dna: CharacterDNA, displayName: string, id: string) {
    const name = characterName({ ...dna, age: Math.min(100, dna.age) });
    card.innerHTML = '<button class="profile-close" aria-label="Close character profile">×</button><span class="profile-eyebrow">FJORDSIDE / INHABITANT</span><h2></h2><p class="profile-identity"></p><h3>Character traits</h3><dl class="profile-traits"></dl><h3>Heritage profile</h3><div class="profile-heritage"></div>';
    card.querySelector('h2')!.textContent = displayName;
    card.querySelector('.profile-identity')!.textContent = `${dna.age} years · ${dna.sex === 'male' ? 'Male' : 'Female'} · ${heritageLabels[name.dominantCulture]}`;
    const traits = card.querySelector('dl')!;
    for (const key of traitKeys) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = key[0].toUpperCase() + key.slice(1);
        dd.textContent = `${Math.round(dna.traits[key] * 100)}%`;
        traits.append(dt, dd);
    }
    const heritage = card.querySelector('.profile-heritage')!;
    const sorted = [...heritageKeys].filter(key => dna.heritage[key] > 0).sort((a, b) => dna.heritage[b] - dna.heritage[a]);
    const minor = document.createElement('details');
    minor.className = 'profile-minor';
    const summary = document.createElement('summary');
    summary.textContent = `+ ${Math.max(0, sorted.length - 3)} minor ancestries`;
    minor.append(summary);
    for (const [index, key] of sorted.entries()) {
        const row = document.createElement('div'), label = document.createElement('span'), value = document.createElement('strong');
        label.textContent = heritageLabels[key];
        value.textContent = `${(dna.heritage[key] * 100).toFixed(1)}%`;
        row.append(label, value);
        (index < 3 ? heritage : minor).append(row);
    }
    if (sorted.length > 3)
        heritage.append(minor);
    card.dataset.characterId = id;
    card.hidden = false;
}
