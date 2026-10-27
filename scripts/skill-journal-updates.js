import { SKILL_JOURNAL_UPDATES } from './skill-journal-data.js';
const patchedPacks = new WeakSet();

export function installSkillJournalCompatibility(pack) {
  if (!pack || patchedPacks.has(pack)) return;
  const original = pack.getDocument;
  pack.getDocument = async function(...args) {
    const journal = await original.apply(this, args);
    updateSkillJournal(journal);
    return journal;
  };
  patchedPacks.add(pack);
}

// A running Foundry server can retain the previous compendium database. Apply
// the same narrowly scoped edits to its loaded documents without writing to an
// open LevelDB or replacing world journals and user-authored content.
export function updateSkillJournal(journal) {
  if (journal?.id !== 'RuSkillsJournal1' || journal.pack !== 'pf1e-ru-improvements.rules') return;
  for (const update of SKILL_JOURNAL_UPDATES) {
    const page = journal.pages.get(update.id);
    if (!page) continue;
    const changes = {}, title = `${update.russian} / ${update.english}`;
    if (page.name === update.russian) changes.name = title;
    const original = page.text?.content ?? '';
    let content = original;
    for (const replacement of update.replacements) content = content.replace(replacement.before, replacement.after);
    if (content !== original) changes['text.content'] = content;
    if (Object.keys(changes).length) page.updateSource(changes);
  }
}

export function skillJournalAliases(name) {
  return [...new Set([name, ...String(name).split('/').map(part => part.trim())])];
}
