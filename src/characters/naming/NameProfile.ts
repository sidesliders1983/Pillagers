import { HeritageKey, HeritageMix } from '../CharacterDNA';
export type NamePattern = { id: string; starts: string[]; endings: string[]; affinity?: HeritageKey[] };
export type NameProfile = {
    malePatterns: NamePattern[];
    femalePatterns: NamePattern[];
    // Only these curated donor stems may cross a cultural grammar boundary.
    loans: Partial<Record<HeritageKey, string[]>>;
    familyRule: 'given-only' | 'norse-patronymic';
};
export type NamingContext = {
    heritage: Partial<HeritageMix>; culture: HeritageKey; sex: 'male' | 'female'; seed: number;
    family?: { father?: { givenName: string; genitive: string } };
};
export type GeneratedName = {
    givenName: string; familyName?: string; patronymic?: string; epithet?: string;
    dominantCulture: HeritageKey;
    derivation: { version: '0.2'; patternId: string; sourceProfiles: HeritageKey[]; components: string[]; familyRule: NameProfile['familyRule']; parentSource?: 'provided' | 'synthetic' };
};
