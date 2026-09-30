import { HeritageKey } from '../CharacterDNA';
import { NameProfile, NamePattern } from './NameProfile';
const pattern = (id: string, starts: string[], endings: string[]): NamePattern => ({id, starts, endings});
// Compact game-art vocabulary. Compounds and cross-cultural loans are curated
// design constructions, not claims that every generated form was attested.
export const nameProfiles: Record<HeritageKey, NameProfile> = {
    scandinavian: {
        malePatterns: [pattern('norse-m-compound',['Arn','Sig','Thor','Hall','Ing','Ragn'],['ulf','vald','mund','rik'])],
        femalePatterns: [pattern('norse-f-compound',['Arn','Sig','Thor','Hall','Ing','Ragn'],['hild','dis','frid'])],
        loans: {angloSaxon:['Ead','Os'], gaelic:['Bran','Con'], baltic:['Val','Rim']}, familyRule:'norse-patronymic',
    },
    angloSaxon: {
        malePatterns:[pattern('english-m-compound',['Ead','Æthel','Os','Wulf','Leof','Beorn'],['ric','red','wine','weard'])],
        femalePatterns:[pattern('english-f-compound',['Ead','Æthel','Wulf','Leof','Beorn'],['gifu','hild','burh','thryth'])],
        loans:{scandinavian:['Arn','Ing'],gaelic:['Bran']},familyRule:'given-only',
    },
    gaelic: {
        malePatterns:[pattern('gaelic-m-diminutive',['Con','Bran','Fionn','Aodh'],['án']),pattern('gaelic-m-devotional',['Mael'],['Coluim','Brigte','Sechnaill'])],
        femalePatterns:[pattern('gaelic-f-diminutive',['Aodh','Fionn'],['ín']),pattern('gaelic-f-compound',['Derv'],['la','orgilla'])],
        loans:{},familyRule:'given-only',
    },
    finnic: {
        malePatterns:[pattern('finnic-m-stem',['Kauko','Toivo','Lempi','Mieli'],['']),pattern('finnic-m-diminutive',['Kau','Lem','Mie'],['ppi'])],
        femalePatterns:[pattern('finnic-f-diminutive',['Lem','Hel'],['mikki']),pattern('finnic-f-kaunikki',['Kau'],['nikki'])],
        loans:{},familyRule:'given-only',
    },
    sami: {
        malePatterns:[pattern('sami-m-niil',['Niil'],['as','á']),pattern('sami-m-aila',['Áil'],['u']),pattern('sami-m-mahte',['Máht'],['e'])],
        femalePatterns:[pattern('sami-f-aila',['Áil'],['a']),pattern('sami-f-biret',['Bir'],['et','eha']),pattern('sami-f-ma',['Má'],['ret','ijá'])],
        loans:{},familyRule:'given-only',
    },
    baltic: {
        malePatterns:[pattern('baltic-m-compound',['Dau','Min','Rim','Vai','Taut'],['girdas','mantas','vydas'])],
        femalePatterns:[pattern('baltic-f-compound',['Dau','Min','Rim','Vai','Taut'],['girdė','mantė','vydė'])],
        loans:{scandinavian:['Val','Sig'],angloSaxon:['Os']},familyRule:'given-only',
    },
};
// Explicit art-direction weights for local pattern families, including cultures
// where phonetic loans would be unsafe. These are not measured historical rates.
nameProfiles.gaelic.malePatterns[0].affinity=['scandinavian','angloSaxon','baltic'];
nameProfiles.gaelic.malePatterns[1].affinity=['gaelic','finnic','sami'];
nameProfiles.gaelic.femalePatterns[0].affinity=['scandinavian','finnic','sami'];
nameProfiles.gaelic.femalePatterns[1].affinity=['gaelic','angloSaxon','baltic'];
for(const sex of ['malePatterns','femalePatterns'] as const){
    nameProfiles.finnic[sex][0].affinity=['finnic','sami','gaelic'];
    nameProfiles.finnic[sex][1].affinity=['scandinavian','angloSaxon','baltic'];
    nameProfiles.sami[sex][0].affinity=['sami','finnic'];
    nameProfiles.sami[sex][1].affinity=['scandinavian','angloSaxon'];
    nameProfiles.sami[sex][2].affinity=['gaelic','baltic'];
}
// Explicit genitives avoid the incorrect universal "father + s" shortcut.
export const norseParents = [
    {givenName:'Ketil',genitive:'Ketils'}, {givenName:'Sigurd',genitive:'Sigurdar'},
    {givenName:'Bjorn',genitive:'Bjarnar'}, {givenName:'Eirik',genitive:'Eiriks'},
    {givenName:'Hakon',genitive:'Hakonar'}, {givenName:'Olaf',genitive:'Olafs'},
];
