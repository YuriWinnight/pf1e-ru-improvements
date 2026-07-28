const MODULE_ID = "pf1e-ru-improvements";
const RULES_PACK_ID = `${MODULE_ID}.rules`;
const SKILLS_JOURNAL_ID = "RuSkillsJournal1";
const CONDITIONS_JOURNAL_ID = "RuConditionsJrnl";
const ATHLETICS_SETTING = "enableAthleticsSkill";
const ATHLETICS_SKILL_ID = "athletics";
const ATHLETICS_ACTOR_TYPES = new Set(["character", "npc"]);
const DOM_TRANSLATION_EXCLUDED_SELECTOR = [
  "[contenteditable]",
  ".ProseMirror",
  ".tox-edit-area",
  ".mce-content-body",
  ".editor-content",
  ".journal-entry-content",
  ".journal-page-content"
].join(", ");
const ITEM_CREATION_DIALOG_CLASSES = new Set([
  "create-consumable",
  "add-character-class",
  "apply-hit-points"
]);
const ACTOR_ROLL_DIALOG_CLASSES = new Set([
  "die-roll",
  "roll-initiative",
  "duplicate-initiative",
  "damage-roll",
  "use-attack"
]);
const newlyCreatedItemKeys = new Set();

function createAthleticsSkillData() {
  return {
    name: "Атлетика",
    ability: "str",
    rank: 0,
    mod: 0,
    rt: false,
    cs: false,
    acp: false,
    background: false,
    custom: true
  };
}

function isActiveGM() {
  if (!game.user?.isGM) return false;
  const activeGM = game.users?.activeGM;
  return !activeGM || activeGM.id === game.user.id;
}

function actorNeedsAthletics(actor) {
  if (!actor || !ATHLETICS_ACTOR_TYPES.has(actor.type)) return false;
  return !Object.prototype.hasOwnProperty.call(actor.system?.skills ?? {}, ATHLETICS_SKILL_ID);
}

async function addAthleticsToActor(actor) {
  if (!actorNeedsAthletics(actor)) return false;
  await actor.update({ [`system.skills.${ATHLETICS_SKILL_ID}`]: createAthleticsSkillData() });
  return true;
}

function reportAthleticsError(error) {
  console.error(`${MODULE_ID} | Не удалось добавить навык «Атлетика».`, error);
  ui.notifications?.error(game.i18n.localize("PF1ERU.Settings.Athletics.Error"));
}

async function addAthleticsToExistingActors({ notify = false } = {}) {
  if (!isActiveGM()) return 0;

  const updates = game.actors
    .filter(actorNeedsAthletics)
    .map((actor) => ({
      _id: actor.id,
      [`system.skills.${ATHLETICS_SKILL_ID}`]: createAthleticsSkillData()
    }));

  if (updates.length) await Actor.updateDocuments(updates);
  if (notify) {
    const key = updates.length
      ? "PF1ERU.Settings.Athletics.Added"
      : "PF1ERU.Settings.Athletics.AlreadyAdded";
    ui.notifications?.info(game.i18n.format(key, { count: updates.length }));
  }
  return updates.length;
}

function registerAthleticsSetting() {
  game.settings.register(MODULE_ID, ATHLETICS_SETTING, {
    name: "PF1ERU.Settings.Athletics.Name",
    hint: "PF1ERU.Settings.Athletics.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (enabled) => {
      if (!enabled) return;
      void addAthleticsToExistingActors({ notify: true }).catch(reportAthleticsError);
    }
  });
}

function numberedIconOptions(folder, prefix, numbers, label) {
  return numbers.map((number) => ({
    label: `${label} ${number}`,
    img: `modules/${MODULE_ID}/assets/consumables/${folder}/${prefix}-${number}.png`
  }));
}

const CONSUMABLE_ICONS = {
  potion: [
    { label: "Зелье исцеления", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-healing-potion.webp` },
    { label: "Зелье невидимости", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-invisibility-potion.webp` },
    { label: "Огненное зелье", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-fire-resistance.webp` },
    { label: "Зелье полёта", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-flying-potion.webp` },
    { label: "Зелье истинного зрения", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-truesight-potion.webp` },
    { label: "Флакон феникса", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-phoenix-flask.webp` },
    { label: "Необычное зелье", img: `modules/${MODULE_ID}/assets/consumables/potions/pf1-unique-4.jpg` },
    { label: "Зелье дубовой кожи", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-barkskin.webp` },
    { label: "Дыхание чёрного дракона", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-black-dragon-breath.webp` },
    { label: "Шипучий эликсир", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-effervescent.webp` },
    { label: "Зелье геккона", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-gecko.webp` },
    { label: "Панацея", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-panacea.webp` },
    { label: "Зелье маскировки", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-disguise.webp` },
    { label: "Зелье быстроты", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-quickness.webp` },
    { label: "Зелье сопротивления", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-resistance.webp` },
    { label: "Уменьшающее зелье", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-shrinking.webp` },
    { label: "Зелье правды", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-truth.webp` },
    { label: "Зелье подводного дыхания", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-water-breathing.webp` },
    { label: "Кровавое вино", img: `modules/${MODULE_ID}/assets/consumables/potions/pyvo-wine-of-blood.webp` },
    ...numberedIconOptions(
      "potions",
      "pyvo-alchemical-potion",
      [4, 5, 6, 9, 10, 13, 15, 22, 25, 28, 33, 37, 39, 44, 47],
      "Алхимическое зелье"
    ),
    ...numberedIconOptions(
      "potions",
      "pyvo-alchemical-elixir",
      [1, 4, 5, 7, 8, 13, 16, 18, 19, 21, 24, 31, 34, 37, 40, 44, 47, 48, 50],
      "Алхимический эликсир"
    )
  ],
  wand: [
    { label: "Золотой жезл исцеления", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-staff-of-healing.webp` },
    { label: "Жезл жизни", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-overflowing-life.webp` },
    { label: "Магический жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-magic-wand.webp` },
    { label: "Грозовой жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-crackling-lightning.webp` },
    { label: "Огненный жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-smoldering-fireballs.webp` },
    { label: "Снежный жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-snowfields.webp` },
    { label: "Паучий жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-spider.webp` },
    { label: "Расширяющий жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-widening.webp` },
    { label: "Звёздный жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pf1-wand-star.jpg` },
    { label: "Жезл озарения", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-staff-of-illumination.webp` },
    { label: "Жезл провидения", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-staff-of-providence.webp` },
    { label: "Природный жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-verdant-staff.webp` },
    { label: "Пылающий жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-staff-of-fire.webp` },
    { label: "Некромантический жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-staff-of-necromancy.webp` },
    { label: "Жезл силы", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-staff-of-power.webp` },
    { label: "Жезл упокоения", img: `modules/${MODULE_ID}/assets/consumables/wands/pyvo-staff-of-final-rest.webp` },
    { label: "Солнечный жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/laaru-sun-staff.webp` },
    ...numberedIconOptions("wands", "pyvo-artifact", [24, 30, 33, 34, 35, 36, 38, 40], "Магический артефакт"),
    ...numberedIconOptions("wands", "pyvo-magic-staff", Array.from({ length: 50 }, (_, index) => index + 1), "Магический посох"),
    { label: "Резной огненный жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-carved-fire.webp` },
    { label: "Розовый резной жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-carved-pink.webp` },
    { label: "Каменный резной жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-carved-stone-shard.webp` },
    { label: "Жезл с синим камнем", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-gem-blue.webp` },
    { label: "Жезл с зелёным камнем", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-gem-green.webp` },
    { label: "Жезл с розовым камнем", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-gem-pink.webp` },
    { label: "Жезл с пурпурным камнем", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-gem-purple.webp` },
    { label: "Жезл с красным камнем", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-gem-red.webp` },
    { label: "Жезл с бирюзовым камнем", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-gem-teal.webp` },
    { label: "Жезл с фиолетовым камнем", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-gem-violet.webp` },
    { label: "Жезл-глаз", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-simple-eye.webp` },
    { label: "Жезл с перекрещёнными костями", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-skull-cross.webp` },
    { label: "Перьевой жезл с черепом", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-skull-feathers.webp` },
    { label: "Раздвоенный жезл с черепом", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-skull-forked.webp` },
    { label: "Рогатый жезл с черепом", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-skull-horned.webp` },
    { label: "Золотой звёздный жезл", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-star-gold.webp` },
    { label: "Жезл-тотем", img: `modules/${MODULE_ID}/assets/consumables/wands/foundry-wand-totem.webp` }
  ]
};

let pendingConsumableIconChoice = null;

const RU_OVERRIDES = {
  "PFPGA.AC.TouchShort": "Касание",
  "PFPGA.AC.FlatFootedShort": "Врасплох",
  "PF1AS.Abilities": "Характеристики",
  "PF1AS.AbilityScores": "Значение характеристик",
  "PF1AS.ACShort": "КБ",
  "PF1AS.FFShort": "Врасплох",
  "PF1AS.NatAC": "Естественная броня",
  "PF1AS.Levels": "уровень",
  "PF1AS.TouchShort": "Касание",
  "PF1AS.PointBuy": "Покупка",
  "PF1AS.SpellRes": "УкМ",
  "PF1AS.SpeedAndMovement": "Скорость и перемещение",
  "PF1AS.AttackBonuses": "Бонусы атаки",
  "PF1AS.BaseCombatStats": "Базовые боевые параметры",
  "PF1AS.NoFeatures": "Создайте (нажав +) или перенесите из компендиума в этот лист.",
  "PF1AS.SpecialQualities": "Особые свойства",
  "PF1AS.CombatManeuvers": "Боевые манёвры",
  "PF1AS.Level0": "Фокусы",
  "PF1AS.Level1": "1 круг",
  "PF1AS.Level2": "2 круг",
  "PF1AS.Level3": "3 круг",
  "PF1AS.Level4": "4 круг",
  "PF1AS.Level5": "5 круг",
  "PF1AS.Level6": "6 круг",
  "PF1AS.Level7": "7 круг",
  "PF1AS.Level8": "8 круг",
  "PF1AS.Level9": "9 круг",
  "PF1AS.Config.Reset": "Сбросить настройки листа",
  "TOKEN.VisionLowLightMultiplier": "Множитель сумеречного зрения",
  "PF1.ACNormal": "КБ",
  "PF1.ACTouch": "Касание",
  "PF1.ACFlatFooted": "Врасплох",
  "PF1.SenseBSense": "Слепое чутьё",
  "PF1.SenseSC": "Нюх",
  "PF1.SenseSI": "Увидеть невидимое",
  "PF1.SenseSID": "Темновидение",
  "PF1.DistTouch": "Касание",
  "PF1.TouchAttackShort": "Атакует по касанию",
  "PF1.CondCowering": "В оцепенении",
  "PF1.CondSqueezing": "Протискивается",
  "PF1.SearchFilterPlaceholder": "Поиск...",
  "PF1.ItemContainerTotalValue": "Общее богатство: {gp} ЗМ, {sp} СМ, {cp} ММ",
  "PF1.ItemContainerTotalItemValue": "Общее богатство: {gp} ЗМ, {sp} СМ, {cp} ММ",
  "PF1.CurrencyGP": "ЗМ",
  "PF1.CurrencySP": "СМ",
  "PF1.CurrencyCP": "ММ",
  "PF1.Lbs": "фнт",
  "PF1.DistFtShort": "фт",
  "PF1.SpellbookName": "Название книги заклинаний",
  "PF1.DomainSlotValue": "Слоты под Сферу/Школу",
  "PF1.Psychic": "Экстрасенсорные заклинания",
  "PF1.Spellcasting.Type.Psychic": "Экстрасенсорный",
  "PF1.SpellBookPrimary": "Основное",
  "PF1.SpellBookSecondary": "Вторичное",
  "PF1.SpellBookTertiary": "Третичное",
  "PF1.SpellBookSpelllike": "Псевдозаклинания",
  "PF1.Defense": "Защита",
  "PF1.TooltipConfigName": "Настройка всплывающей подсказки токена",
  "PF1.Save": "Сохранить",
  "PF1.BaseDice": "Натуральная кость",
  "PF1.SkillCheck": "Проверка навыка {skill}",
  "PF1.CreateItemForSpell": "Создать предмет для {name}",
  "PF1.CreateItemNamePlaceholder": "Жезл, Свиток или Зелье",
  "PF1.CreateItemWandOf": "Жезл {name}",
  "PF1.CreateItemScrollOf": "Свиток {name}",
  "PF1.CreateItemPotionOf": "Зелье {name}",
  "PF1.WeaponDetails": "Подробности оружия",
  "PF1.Resizing": "Подогнать",
  "PF1.BaseTypes.Label": "Тип снаряжения",
  "PF1.BaseTypes.Description": "Для способностей, которые работают на определённые типы оружия, например, черта Уверенное владение оружием.",
  "PF1.WeaponGroups": "Группы оружия",
  "PF1.WeaponPropAutomatic": "Автоматическое",
  "PF1.WeaponPropScatter": "Рассеивающее",
  "PF1.WeaponPropSpecial": "Особое",
  "PF1.Identifier": "Идентификатор",
  "PF1.Ammunition": "Боеприпасы",
  "PF1.UsesAmmo": "использовать Боеприпасы",
  "PF1.EnhancementBonusOverride": "Учитывать бонус усиления",
  "PF1.DCFormula": "Формула СЛ",
  "PF1.Undefined": "Не определён",
  "PF1.Precision": "Точный",
  "PF1.DamageTypeUntyped": "Без типа",
  "PF1.DamageTypeCategory.physical": "Физический",
  "PF1.DamageTypeCategory.energy": "Энергия",
  "PF1.DamageTypeCategory.misc": "Прочее",
  "PF1.DamageModifiers": "Модификаторы урона",
  "PF1.ProficientAttack": "Умение обращаться",
  "PF1.ProficienciesGranted": "Предоставляет умение в обращении",
  "PF1.DescriptorPlural": "Дескрипторы",
  "PF1.SpellComponentThought": "Мысленный",
  "PF1.SpellComponentEmotion": "Эмоциональный",
  "PF1.CastsPerDayUsedFormula": "Формула подсчёта заклинаний в день",
  "PF1.DCOffsetFormula": "Формула смещения СЛ",
  "PF1.ChargeCostFormula": "Формула использования зарядов",
  "PF1.PricePerCharge": "Цена за заряд",
  "PF1.RechargeFormula": "Формула перезарядки",
  "PF1.IdentifyDC": "СЛ Опознания",
  "PF1.IdentifyDCNumber": "СЛ Опознания {dc}",
  "PF1.CustomHitDice": "Настроить КЗ",
  "PF1.CustomHitDiceHint": "Вставьте формулу, например floor(@item.level / 2)",
  "PF1.HitPoints": "Пункты здоровья",
  "PF1.LevelUp.Health.Roll.Desc":
    "Количество пунктов здоровья, получаемых на этом уровне, будет определено броском кости здоровья вашего класса.",
  "PF1.LevelUp.Health.Manual.Desc": "Вы сами определите, сколько пунктов здоровья получите на этом уровне.",
  "PF1.LevelUp.FC.Label": "Бонус предпочитаемого класса",
  "PF1.LevelUp.FC.HP.Desc":
    "В качестве бонуса предпочитаемого класса на этом уровне вы получите 1 пункт здоровья.",
  "PF1.LevelUp.FC.Skill.Desc":
    "В качестве бонуса предпочитаемого класса на этом уровне вы получите 1 пункт навыка, который сможете распределить по своему усмотрению.",
  "PF1.LevelUp.FC.Alt.Desc":
    "В качестве бонуса предпочитаемого класса на этом уровне вы получите особый бонус, зависящий от сочетания вашей расы и класса.",
  "PF1.FavouredClassBonus.Label": "Бонус предпочитаемого класса",
  "PF1.FavouredClassBonus.HP": "Пункт здоровья",
  "PF1.FavouredClassBonus.Skill": "Пункт навыка",
  "PF1.FavouredClassBonus.Alt": "Альтернативный бонус",
  "PF1.Info.AddClassDialog": "Чтобы пропустить это окно, зажмите Shift.",
  "PF1.Info.AddClassDialog_Desc":
    "Нажмите «Обычный», чтобы открыть короткий мастер настройки, или «Без изменений», чтобы добавить класс без каких-либо правок.",
  "PF1.Raw": "Без изменений",
  "PF1.Spellcasting.Progression.Label": "Развитие",
  "PF1.Spellcasting.Type.Label": "Тип заклинания",
  "PF1.Spellcasting.Type.Arcane": "Мистический",
  "PF1.Spellcasting.Type.Divine": "Сакральный",
  "PF1.Spellcasting.Type.Alchemy": "Алхимический",
  "PF1.AutoSpellClassLevelOffset.Formula": "Модификации уровня заклинателя",
  "PF1.AutoSpellClassLevelOffset.InfoBox":
    "Если у вас есть престиж-класс, который изменяет ваш уровень заклинателя, добавьте его сюда (например @classes.mysticTheurge.level)",
  "PF1.AbilityTest": "Проверка характеристики {ability}",
  "PF1.TakeX": "Взять {number}",
  "PF1.InitiativeCheck": "{name}: Проверка инициативы",
  "PF1.Roll": "Бросок",
  "PF1.SavingThrow": "Испытание",
  "PF1.SavingThrowRoll": "Испытание {save}",
  "PF1.Application.DamageResistanceSelector.DRTitle": "Выбор снижения урона",
  "PF1.Application.DamageResistanceSelector.ERTitle": "Выбор невосприимчивости к энергии",
  "PF1.Application.DamageResistanceSelector.DamageAmount": "Количество",
  "PF1.Application.DamageResistanceSelector.Bypassed": "Преодолевает",
  "PF1.Application.DamageResistanceSelector.Resisted": "Против",
  "PF1.Application.DamageResistanceSelector.TypeNothing": "Никакое",
  "PF1.Application.DamageResistanceSelector.CombinationType": "Условие",
  "PF1.Application.DamageResistanceSelector.CombinationOr": "или",
  "PF1.Application.DamageResistanceSelector.CombinationAnd": "и",
  "PF1.Application.DamageResistanceSelector.CombinationFormattedOr": "{type1} или {type2}",
  "PF1.Application.DamageResistanceSelector.CombinationFormattedAnd": "{type1} и {type2}",
  "PF1.Application.EntrySelector.Title": "Выбор записи",
  "PF1.Application.ChangeTargetSelector.Title": "Выбрать цель изменения",
  "PF1.Application.TraitSelector.CustomHint": "Несколько значений можно разделить точкой с запятой (;).",
  "PF1.AddEntry": "Добавить запись",
  "PF1.Operator": "Условие",
  "PF1.CondTypeDeathEffects": "Эффекты смерти",
  "PF1.Info.NotFunctioning": "В настоящее время система не использует эту функцию.",
  "PF1.LanguageAndroffan": "Андроффан",
  "PF1.Notes": "Заметки",
  "PF1.NewItem": "Новый {type}",
  "PF1.WeaponGroupAxes": "Топоры",
  "PF1.WeaponGroupBladesHeavy": "Тяжёлые клинки",
  "PF1.WeaponGroupBladesLight": "Лёгкие клинки",
  "PF1.WeaponGroupBows": "Луки",
  "PF1.WeaponGroupClose": "Тычковое",
  "PF1.WeaponGroupCrossbows": "Арбалеты",
  "PF1.WeaponGroupDouble": "Двустороннее",
  "PF1.WeaponGroupFirearms": "Огнестрельное",
  "PF1.WeaponGroupFlails": "Гибкое",
  "PF1.WeaponGroupHammers": "Молоты",
  "PF1.WeaponGroupMonk": "Монашеское",
  "PF1.WeaponGroupNatural": "Естественное",
  "PF1.WeaponGroupPolearms": "Древковое",
  "PF1.WeaponGroupSiegeEngines": "Осадное",
  "PF1.WeaponGroupSpears": "Копья",
  "PF1.WeaponGroupThrown": "Метательное",
  "PF1.WeaponGroupTribal": "Племенное",
  "PF1.LinkHelpChildren": "Связанные дочерние предметы удаляются из актёра при удалении родительского предмета связи (этого предмета).",
  "PF1.LinkHelpCharges": "Связанные предметы наследуют и совместно используют заряды родительского предмета связи (этого предмета).",
  "PF1.DeleteItem": "Удалить предмет",
  "PF1.DeleteItemTitle": "Удалить предмет: {name}",
  "PF1.ScriptCalls.Name": "Вызовы скриптов",
  "PF1.ScriptCalls.NewName": "Новый вызов скрипта",
  "PF1.ScriptCalls.Create": "Создать встроенный вызов скрипта",
  "PF1.ScriptCalls.Use.Name": "Использование",
  "PF1.ScriptCalls.Use.Info": "Вызывается, когда предмет был «использован» — например, при атаке, выпивании зелья и т. п. Содержит дополнительную переменную `attacks` — массив бросков атаки этого действия, если они есть.",
  "PF1.ScriptCalls.Equip.Name": "Экипировка",
  "PF1.ScriptCalls.Equip.Info": "Вызывается, когда предмет экипируют или снимают. Содержит дополнительную переменную `equipped`, принимающую значение `true` или `false`.",
  "PF1.ScriptCalls.Toggle.Name": "Переключение",
  "PF1.ScriptCalls.Toggle.Info": "Вызывается при включении или отключении элемента. Содержит дополнительную переменную `state`, принимающую значение `true` или `false`.",
  "PF1.ScriptCalls.ChangeQuantity.Name": "Изменение количества",
  "PF1.ScriptCalls.ChangeQuantity.Info": "Вызывается при изменении количества предмета. Содержит дополнительные переменные `quantity.previous` и `quantity.new`, обе из которых являются числами.",
  "PF1.ScriptCalls.ChangeLevel.Name": "Изменение уровня",
  "PF1.ScriptCalls.ChangeLevel.Info": "Вызывается при изменении уровня элемента. Содержит дополнительные переменные `quantity.previous` и `quantity.new`; обе имеют числовое значение.",
  "PF1.Hidden": "Скрыто",
  "PF1.ActivationTypeNonaction": "Не требует действия",
  "PF1.ActivationTypeAoO": "Внеочередная атака",
  "PF1.TimeTurn": "Ход",
  "PF1.AmmunitionSubtype": "Тип боеприпаса",
  "PF1.AmmoTypeArrow": "Стрела",
  "PF1.AmmoTypeBolt": "Арбалетный болт",
  "PF1.AmmoTypeRepeatingBolt": "Арбалетный болт (многозарядный)",
  "PF1.AmmoTypeBulletSling": "Ядро",
  "PF1.AmmoTypeBulletGun": "Пуля",
  "PF1.AmmoTypeBulletDragoon": "Пуля (Драгунское огнестрельное оружие)",
  "PF1.AmmoTypeDart": "Дротик",
  "PF1.AmmoTypeSiege": "Осадный боеприпас",
  "PF1.BonusModifierHaste": "Ускорение",
  "PF1.Haste": "Ускорение",
  "PF1.BuffTarUntrainedSkills": "Навыки без изучения",
  "PF1.CarryStrength": "Силу переноски",
  "PF1.CarryMultiplier": "Модификатор переноски",
  "PF1.GiveItem": "Передать предмет актёру",
  "PF1.SplitItem": "Разделить предмет",
  "PF1.Dialog.SplitItem.Title": "Разделить предмет: {name}",
  "PF1.Dialog.SplitItem.Desc": "Укажите количество, которое нужно отделить.",
  "PF1.Split": "Разделить",
  "PF1.Abundant": "Обильные",
  "PF1.AbundantDesc": "Не уменьшать количество этих боеприпасов при использовании.",
  "PF1.ItemContainerSellValue": "Цена продажи: {gp} ЗМ, {sp} СМ, {cp} ММ",
  "PF1.Sheet.Container": "Контейнер",
  "ITEM.TypeContainer": "Контейнер"
};

const EXACT_RENDERED_TRANSLATIONS = {
  Use: "Использование",
  Equip: "Экипировка",
  Toggle: "Переключение",
  "Change Level": "Изменение уровня",
  "Called when the item has been enabled or disabled. Has the extra variable `state`, which is either `true` or `false`.":
    "Вызывается при включении или отключении элемента. Содержит дополнительную переменную `state`, принимающую значение `true` или `false`.",
  "Called when the level of the item has been changed. Has the extra variables `quantity.previous` and `quantity.new`, which are both numbers.":
    "Вызывается при изменении уровня элемента. Содержит дополнительные переменные `quantity.previous` и `quantity.new`; обе имеют числовое значение.",
  "You can hold Shift to bypass this dialog.": "Чтобы пропустить это окно, зажмите Shift.",
  "Your hit points for this level will be rolled for based on the size of your hit die.":
    "Количество пунктов здоровья, получаемых на этом уровне, будет определено броском кости здоровья вашего класса.",
  "You will decide how many hit points you gain for this level.":
    "Вы сами определите, сколько пунктов здоровья получите на этом уровне.",
  "Favoured Class Bonus": "Бонус предпочитаемого класса",
  "You will gain a single hit point as your favoured class bonus for this level.":
    "В качестве бонуса предпочитаемого класса на этом уровне вы получите 1 пункт здоровья.",
  "You will gain a single skill rank to freely spend as your favoured class bonus for this level.":
    "В качестве бонуса предпочитаемого класса на этом уровне вы получите 1 пункт навыка, который сможете распределить по своему усмотрению.",
  "You will gain something specific for your class and race combination as your favoured class bonus for this level.":
    "В качестве бонуса предпочитаемого класса на этом уровне вы получите особый бонус, зависящий от сочетания вашей расы и класса.",
  "Pressing Normal opens a short wizard, while pressing Raw will add the class without any alterations.":
    "Нажмите «Обычный», чтобы открыть короткий мастер настройки, или «Без изменений», чтобы добавить класс без каких-либо правок.",
  "Damage Reduction Selection": "Выбор снижения урона",
  "Energy Resistance Selection": "Выбор невосприимчивости к энергии",
  Amount: "Количество",
  "Bypassed by": "Преодолевает",
  Against: "Против",
  Operator: "Условие",
  or: "или",
  and: "и",
  Nothing: "Никакое",
  "Add Entry": "Добавить запись",
  "Add Entary": "Добавить запись",
  "Entry Selector": "Выбор записи",
  "Death Effects": "Эффекты смерти",
  "You can separate distinct entries with semicolon (;).": "Несколько значений можно разделить точкой с запятой (;).",
  "The system (currently) doesn't use this feature": "В настоящее время система не использует эту функцию.",
  Androffan: "Андроффан",
  Notes: "Заметки",
  Roll: "Бросок",
  "Linked children are deleted from the actor when the link parent (this item) is deleted.":
    "Связанные дочерние предметы удаляются из актёра при удалении родительского предмета связи (этого предмета).",
  "Linked items inherit and share the charges from the link parent (this item).":
    "Связанные предметы наследуют и совместно используют заряды родительского предмета связи (этого предмета).",
  "Delete Item": "Удалить предмет",
  "Script Calls": "Вызовы скриптов",
  "New Script Call": "Новый вызов скрипта",
  "Change Quantity": "Изменение количества",
  Hidden: "Скрыто",
  "Create embedded script call": "Создать встроенный вызов скрипта",
  Nonaction: "Не требует действия",
  "Attack of Opportunity": "Внеочередная атака",
  Turn: "Ход",
  "Ammunition Subtype": "Тип боеприпаса",
  Arrow: "Стрела",
  Bolt: "Арбалетный болт",
  "Bolt (Repeating)": "Арбалетный болт (многозарядный)",
  "Bullet (Sling)": "Ядро",
  "Bullet (Firearm)": "Пуля",
  "Bullet (Dragoon Firearm)": "Пуля (Драгунское огнестрельное оружие)",
  Dart: "Дротик",
  Siege: "Осадный боеприпас",
  Haste: "Ускорение",
  "Select change target": "Выбрать цель изменения",
  "Untrained Skills": "Навыки без изучения",
  "Carry Strength": "Силу переноски",
  "Carry Strenght": "Силу переноски",
  "Carry Multiplier": "Модификатор переноски",
  Defense: "Защита",
  Defence: "Защита",
  "Give item to actor": "Передать предмет актёру",
  "Split Item": "Разделить предмет",
  "Input the number to split off.": "Укажите количество, которое нужно отделить.",
  Split: "Разделить",
  Abundant: "Обильные",
  "Never remove this ammunition when used.": "Не уменьшать количество этих боеприпасов при использовании.",
  Container: "Контейнер",
  Axes: "Топоры",
  "Blades, Heavy": "Тяжёлые клинки",
  "Blades, Light": "Лёгкие клинки",
  Bows: "Луки",
  Close: "Тычковое",
  Crossbows: "Арбалеты",
  Double: "Двустороннее",
  Firearms: "Огнестрельное",
  Flails: "Гибкое",
  Hammers: "Молоты",
  Monk: "Монашеское",
  Natural: "Естественное",
  Polearms: "Древковое",
  "Siege Engines": "Осадное",
  Spears: "Копья",
  Thrown: "Метательное",
  Tribal: "Племенное"
};

const journalReferences = {
  conditions: new Map(),
  skills: new Map()
};

const CONDITION_REFERENCE_ALIASES = {
  pf1_blind: "Blinded",
  "Ослеп": "Blinded",
  "Слепота": "Blinded",
  pf1_deaf: "Deafened",
  "Оглох": "Deafened",
  "Глухота": "Deafened",
  pf1_sleep: "Helpless",
  "Сон": "Helpless",
  "Беспомощен": "Helpless",
  "Беспомощность": "Helpless"
};

function isRussian() {
  const configuredLanguage = game.settings?.get?.("core", "language");
  const documentLanguage = document.documentElement.lang;
  return game.i18n?.lang === "ru"
    || configuredLanguage === "ru"
    || documentLanguage === "ru"
    || documentLanguage.startsWith("ru-");
}

function setTranslation(path, value) {
  foundry.utils.setProperty(game.i18n.translations, path, value);
}

function applyRussianTranslations() {
  if (!isRussian()) return;
  for (const [path, value] of Object.entries(RU_OVERRIDES)) setTranslation(path, value);
  refreshLocalizedPf1Config();
}

function refreshLocalizedPf1Config() {
  if (!globalThis.pf1?.config) return;

  const entries = [
    [pf1.config.weaponGroups, "axes", "PF1.WeaponGroupAxes"],
    [pf1.config.weaponGroups, "bladesHeavy", "PF1.WeaponGroupBladesHeavy"],
    [pf1.config.weaponGroups, "bladesLight", "PF1.WeaponGroupBladesLight"],
    [pf1.config.weaponGroups, "bows", "PF1.WeaponGroupBows"],
    [pf1.config.weaponGroups, "close", "PF1.WeaponGroupClose"],
    [pf1.config.weaponGroups, "crossbows", "PF1.WeaponGroupCrossbows"],
    [pf1.config.weaponGroups, "double", "PF1.WeaponGroupDouble"],
    [pf1.config.weaponGroups, "firearms", "PF1.WeaponGroupFirearms"],
    [pf1.config.weaponGroups, "flails", "PF1.WeaponGroupFlails"],
    [pf1.config.weaponGroups, "hammers", "PF1.WeaponGroupHammers"],
    [pf1.config.weaponGroups, "monk", "PF1.WeaponGroupMonk"],
    [pf1.config.weaponGroups, "natural", "PF1.WeaponGroupNatural"],
    [pf1.config.weaponGroups, "polearms", "PF1.WeaponGroupPolearms"],
    [pf1.config.weaponGroups, "siegeEngines", "PF1.WeaponGroupSiegeEngines"],
    [pf1.config.weaponGroups, "spears", "PF1.WeaponGroupSpears"],
    [pf1.config.weaponGroups, "thrown", "PF1.WeaponGroupThrown"],
    [pf1.config.weaponGroups, "tribal", "PF1.WeaponGroupTribal"],
    [pf1.config.senses, "bse", "PF1.SenseBSense"],
    [pf1.config.senses, "si", "PF1.SenseSI"],
    [pf1.config.senses, "sid", "PF1.SenseSID"],
    [pf1.config.senses, "sc", "PF1.SenseSC"],
    [pf1.config.ammoTypes, "arrow", "PF1.AmmoTypeArrow"],
    [pf1.config.ammoTypes, "bolt", "PF1.AmmoTypeBolt"],
    [pf1.config.ammoTypes, "repeatingBolt", "PF1.AmmoTypeRepeatingBolt"],
    [pf1.config.ammoTypes, "slingBullet", "PF1.AmmoTypeBulletSling"],
    [pf1.config.ammoTypes, "gunBullet", "PF1.AmmoTypeBulletGun"],
    [pf1.config.ammoTypes, "dragoonBullet", "PF1.AmmoTypeBulletDragoon"],
    [pf1.config.ammoTypes, "dart", "PF1.AmmoTypeDart"],
    [pf1.config.ammoTypes, "siege", "PF1.AmmoTypeSiege"],
    [pf1.config.languages, "androffan", "PF1.LanguageAndroffan"],
    [pf1.config.bonusModifiers, "haste", "PF1.BonusModifierHaste"],
    [pf1.config.conditionTypes, "deathEffects", "PF1.CondTypeDeathEffects"],
    [pf1.config.abilityActivationTypes, "nonaction", "PF1.ActivationTypeNonaction"],
    [pf1.config.abilityActivationTypes, "aoo", "PF1.ActivationTypeAoO"],
    [pf1.config.abilityActivationTypes_unchained, "nonaction", "PF1.ActivationTypeNonaction"],
    [pf1.config.abilityActivationTypes_unchained, "aoo", "PF1.ActivationTypeAoO"],
    [pf1.config.timePeriods, "turn", "PF1.TimeTurn"]
  ];

  for (const [collection, key, translationKey] of entries) {
    if (collection && key in collection) collection[key] = RU_OVERRIDES[translationKey];
  }

  if (pf1.config.buffTargets?.unskills) pf1.config.buffTargets.unskills.label = RU_OVERRIDES["PF1.BuffTarUntrainedSkills"];
  if (pf1.config.buffTargets?.carryStr) pf1.config.buffTargets.carryStr.label = RU_OVERRIDES["PF1.CarryStrength"];
  if (pf1.config.buffTargets?.carryMult) pf1.config.buffTargets.carryMult.label = RU_OVERRIDES["PF1.CarryMultiplier"];
  if (pf1.config.buffTargetCategories?.defense) pf1.config.buffTargetCategories.defense.label = RU_OVERRIDES["PF1.Defense"];
  if (pf1.config.contextNoteCategories?.defense) pf1.config.contextNoteCategories.defense.label = RU_OVERRIDES["PF1.Defense"];
}

function russianSpellWord(quantity) {
  const value = Math.abs(Number(quantity));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "заклинаний";
  if (last === 1) return "заклинание";
  if (last >= 2 && last <= 4) return "заклинания";
  return "заклинаний";
}

function russianNewItemName(typeLabel) {
  const label = String(typeLabel ?? "предмет").trim() || "предмет";
  const lowerLabel = label.charAt(0).toLocaleLowerCase("ru-RU") + label.slice(1);
  const feminine = /(?:^|\s)(?:атака|черта|добыча|раса|способность|особенность)(?:\s|$)/i.test(label);
  const neuter = /(?:^|\s)(?:оружие|снаряжение|заклинание)(?:\s|$)/i.test(label);
  const adjective = feminine ? "Новая" : neuter ? "Новое" : "Новый";
  return `${adjective} ${lowerLabel}`;
}

function installPluralFormatting() {
  if (game.i18n.__pf1eRuImprovementsFormat) return;
  const original = game.i18n.format.bind(game.i18n);

  game.i18n.format = function (stringId, data = {}) {
    if (isRussian()) {
      if (stringId === "PF1.NewItem") return russianNewItemName(data.type);
      if (stringId === "PF1.PrepareMoreSpell" || stringId === "PF1.PrepareMoreSpells") {
        const quantity = Number(data.quantity ?? 1);
        return `Вы можете подготовить на ${quantity} ${russianSpellWord(quantity)} больше`;
      }
      if (stringId === "PF1.TooManySpells") {
        const quantity = Number(data.quantity ?? 0);
        const agreement = Math.abs(quantity) % 10 === 1 && Math.abs(quantity) % 100 !== 11
          ? "выходящее"
          : "выходящих";
        return `У вас ${quantity} ${russianSpellWord(quantity)}, ${agreement} за лимит`;
      }
    }
    return original(stringId, data);
  };

  game.i18n.__pf1eRuImprovementsFormat = true;
}

function installModuleStyles() {
  const id = `${MODULE_ID}-styles`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `modules/${MODULE_ID}/styles/pf1e-ru-improvements.css`;
  document.head.append(link);
}

function normalizeLabel(value) {
  return String(value ?? "")
    .replace(/^Навык:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/ё/g, "е")
    .trim()
    .toLocaleLowerCase("ru");
}

function normalizeReference(value) {
  return String(value ?? "")
    .replace(/ё/gi, "е")
    .replace(/[^a-zа-я0-9]/gi, "")
    .toLocaleLowerCase("ru");
}

async function collectCompendiumReferences() {
  journalReferences.conditions.clear();
  journalReferences.skills.clear();

  const pack = game.packs.get(RULES_PACK_ID);
  if (!pack) {
    console.warn(`${MODULE_ID} | Компендиум русских правил не найден.`);
    return;
  }

  const [skillsJournal, conditionsJournal] = await Promise.all([
    pack.getDocument(SKILLS_JOURNAL_ID),
    pack.getDocument(CONDITIONS_JOURNAL_ID)
  ]);

  for (const page of skillsJournal?.pages ?? []) {
    journalReferences.skills.set(normalizeLabel(page.name), page.uuid);
  }

  for (const page of conditionsJournal?.pages ?? []) {
    const englishName = page.getFlag(MODULE_ID, "englishName");
    if (englishName) journalReferences.conditions.set(normalizeReference(englishName), page.uuid);
    journalReferences.conditions.set(normalizeReference(page.name), page.uuid);
  }

  for (const [alias, englishName] of Object.entries(CONDITION_REFERENCE_ALIASES)) {
    const uuid = journalReferences.conditions.get(normalizeReference(englishName));
    if (uuid) journalReferences.conditions.set(normalizeReference(alias), uuid);
  }

  console.info(
    `${MODULE_ID} | Загружено страниц навыков: ${journalReferences.skills.size}; состояний: ${journalReferences.conditions.size}.`
  );
}

function pluralizeRenderedWarnings(value) {
  return value
    .replace(/You can prepare\s+(\d+)\s+more spells?/gi, (_, number) => {
      const quantity = Number(number);
      return `Вы можете подготовить на ${quantity} ${russianSpellWord(quantity)} больше`;
    })
    .replace(/You have\s+(\d+)\s+too many spells/gi, (_, number) => {
      const quantity = Number(number);
      const agreement = quantity % 10 === 1 && quantity % 100 !== 11 ? "выходящее" : "выходящих";
      return `У вас ${quantity} ${russianSpellWord(quantity)}, ${agreement} за лимит`;
    });
}

function translateText(value) {
  const exact = (() => {
    const leading = value.match(/^\s*/)?.[0] ?? "";
    const trailing = value.match(/\s*$/)?.[0] ?? "";
    const content = value.slice(leading.length, value.length - trailing.length || undefined);
    const replacement = EXACT_RENDERED_TRANSLATIONS[content];
    return replacement === undefined ? value : `${leading}${replacement}${trailing}`;
  })();

  return pluralizeRenderedWarnings(exact)
    .replace(/([^\r\n]+?)\s+Ability Test\b/gi, (_, ability) => `Проверка характеристики ${ability.trim()}`)
    .replace(/\bFortitude Saving Throw\b/gi, "Испытание Стойкости")
    .replace(/\bReflex Saving Throw\b/gi, "Испытание Реакции")
    .replace(/\bWill Saving Throw\b/gi, "Испытание Воли")
    .replace(/\bSaving Throw\b/g, "Испытание")
    .replace(/\bInitiative Check\b/g, "Проверка инициативы")
    .replace(/\bTake\s+(10|20)\b/g, "Взять $1")
    .replace(/([^\r\n]+?)\s+Skill Check\b/gi, (_, skill) => `Проверка навыка ${skill.trim()}`)
    .replace(/\bBase Dice\b/g, "Натуральная кость")
    .replace(/\bCreate Item for\b/g, "Создать предмет для")
    .replace(/Wand, Scroll, or Potion/g, "Жезл, Свиток или Зелье")
    .replace(/\be\.g\./gi, "например")
    .replace(/\bSpell Res\.?(?=\s|$)/g, "УкМ")
    .replace(/\bUse Point Buy\b/g, "Покупка")
    .replace(/\bSee Invisibility\b/gi, "Увидеть невидимое")
    .replace(/\bSee in darkness\b/gi, "Темновидение")
    .replace(/\bBlindsense\b/gi, "Слепое чутьё")
    .replace(/\bScent\b/gi, "Нюх")
    .replace(/\bCowering\b/g, "В оцепенении")
    .replace(/\bSqueezing\b/g, "Протискивается")
    .replace(/\bPrecision\b/g, "Точный")
    .replace(/\bUntyped\b/g, "Без типа")
    .replace(/\bUndefined\b/g, "Не определён")
    .replace(/^(\s*)Automatic(\s*)$/g, "$1Автоматическое$2")
    .replace(/^(\s*)Scatter(\s*)$/g, "$1Рассеивающее$2")
    .replace(/^(\s*)Special(\s*)$/g, "$1Особое$2")
    .replace(/^(\s*)Primary(\s*)$/g, "$1Основное$2")
    .replace(/^(\s*)Secondary(\s*)$/g, "$1Вторичное$2")
    .replace(/^(\s*)Tertiary(\s*)$/g, "$1Третичное$2")
    .replace(/^(\s*)Spell-likes?(\s*)$/gi, "$1Псевдозаклинания$2")
    .replace(/\bIdentify DC\b/g, "СЛ Опознания")
    .replace(/\bDC Formula\b/g, "Формула СЛ")
    .replace(/формула СЛ/g, "Формула СЛ")
    .replace(/Неопределённый/g, "Не определён")
    .replace(/Очки здоровья/g, "Пункты здоровья")
    .replace(/\bDelete Item:\s*/g, "Удалить предмет: ")
    .replace(/\bSplit item:\s*/g, "Разделить предмет: ")
    .replace(/\bSell Value:\s*/g, "Цена продажи: ")
    .replace(/\bGP\b/g, "ЗМ")
    .replace(/\bSP\b/g, "СМ")
    .replace(/\bCP\b/g, "ММ")
    .replace(/Search filter(?:\.\.\.|…)/gi, "Поиск...")
    .replace(/(\d)\s*ft\.?(?=\s|$)/gi, "$1 фт.")
    .replace(/\bft\.(?=\s|$)/gi, "фт.")
    .replace(/\bft\b/gi, "фт")
    .replace(/\blbs?\b/gi, "фнт")
    .replace(/\bIb\b/g, "фнт");
}

function prepareRussianSaveRoll(_actor, rollOptions, savingThrowId) {
  if (!isRussian() || !rollOptions) return;
  const flavor = {
    fort: "Испытание Стойкости",
    ref: "Испытание Реакции",
    will: "Испытание Воли"
  }[savingThrowId];
  if (flavor) rollOptions.flavor = flavor;
}

function findSkillJournalUuid({ actor, skillId, label } = {}) {
  const candidates = [];
  if (actor && skillId) {
    try {
      const skill = actor.getSkillInfo?.(skillId);
      candidates.push(skill?.name, skill?.parentSkill?.name);
    } catch (_error) {
      // Сообщение может относиться к удалённому пользовательскому навыку.
    }

    const mainSkillId = String(skillId).split(".")[0];
    candidates.push(pf1?.config?.skills?.[mainSkillId]);
  }
  candidates.push(label);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const uuid = journalReferences.skills.get(normalizeLabel(candidate));
    if (uuid) return uuid;
  }
  return null;
}

function redirectChatSkillReference(message, root) {
  if (!isRussian() || !(root instanceof HTMLElement)) return;
  const skillId = message?.getFlag?.("pf1", "subject.skill")
    ?? foundry.utils.getProperty(message, "flags.pf1.subject.skill");
  if (!skillId) return;

  const actor = CONFIG.ChatMessage.documentClass.getSpeakerActor?.(message.speaker);
  const flavor = root.querySelector(".flavor-text")?.textContent
    ?.replace(/Проверка навыка/gi, "")
    .replace(/Skill Check/gi, "")
    .trim();
  const uuid = findSkillJournalUuid({ actor, skillId, label: flavor });
  if (!uuid) return;

  for (const anchor of root.querySelectorAll('[data-action="open-compendium-entry"]')) {
    anchor.dataset.compendiumEntry = uuid;
    anchor.dataset.documentType = "JournalEntryPage";
    anchor.title = "Открыть русское описание навыка";
    anchor.dataset.tooltip = "Открыть русское описание навыка";
  }
}

function translateActorRollFlavor(root) {
  if (!isRussian() || !(root instanceof HTMLElement)) return;
  const flavor = root.querySelector(".flavor-text");
  if (!(flavor instanceof HTMLElement)) return;

  const value = flavor.textContent ?? "";
  const translated = pluralizeRenderedWarnings(value)
    .replace(/([^\r\n]+?)\s+Ability Test\b/gi, (_, ability) => `Проверка характеристики ${ability.trim()}`)
    .replace(/\bFortitude Saving Throw\b/gi, "Испытание Стойкости")
    .replace(/\bReflex Saving Throw\b/gi, "Испытание Реакции")
    .replace(/\bWill Saving Throw\b/gi, "Испытание Воли")
    .replace(/\bSaving Throw\b/g, "Испытание")
    .replace(/\bInitiative Check\b/g, "Проверка инициативы")
    .replace(/\bTake\s+(10|20)\b/g, "Взять $1")
    .replace(/([^\r\n]+?)\s+Skill Check\b/gi, (_, skill) => `Проверка навыка ${skill.trim()}`)
    .replace(/^\s*Roll\s*$/g, "Бросок");

  if (translated !== value) flavor.textContent = translated;
}

function processChatMessage(message, html) {
  const root = html?.[0] ?? html;
  translateActorRollFlavor(root);
  redirectChatSkillReference(message, root);
}

function prepareRussianSkillRoll(actor, rollOptions, skillId) {
  if (!isRussian()) return;
  const uuid = findSkillJournalUuid({ actor, skillId });
  if (!uuid) return;
  rollOptions.compendium = { entry: uuid, type: "JournalEntryPage" };
}

function processRenderedChatMessages() {
  for (const root of document.querySelectorAll("#chat-log .message[data-message-id]")) {
    const message = game.messages.get(root.dataset.messageId);
    if (message) processChatMessage(message, root);
  }
}

function isItemCreationDialog(app, root) {
  if (!(root instanceof HTMLElement)) return false;
  const classes = Array.from(app?.options?.classes ?? []);
  if (classes.some((className) => ITEM_CREATION_DIALOG_CLASSES.has(className))) return true;

  const appElement = app?.element?.[0] ?? app?.element;
  const dialogRoot = appElement instanceof HTMLElement ? appElement : root;
  const selector = Array.from(ITEM_CREATION_DIALOG_CLASSES, (className) => `.${className}`).join(", ");
  if (dialogRoot.matches(selector) || dialogRoot.querySelector(selector)) return true;

  const constructorName = String(app?.constructor?.name ?? "");
  const documentName = app?.options?.documentName
    ?? app?.documentName
    ?? app?.object?.documentName;
  return documentName === "Item" && /create/i.test(constructorName);
}

function isActorRollDialog(app, root) {
  if (!(root instanceof HTMLElement)) return false;
  const classes = Array.from(app?.options?.classes ?? []);
  if (classes.some((className) => ACTOR_ROLL_DIALOG_CLASSES.has(className))) return true;

  const appElement = app?.element?.[0] ?? app?.element;
  const dialogRoot = appElement instanceof HTMLElement ? appElement : root;
  const selector = Array.from(ACTOR_ROLL_DIALOG_CLASSES, (className) => `.${className}`).join(", ");
  return dialogRoot.matches(selector) || Boolean(dialogRoot.querySelector(selector));
}

function itemTrackingKey(item) {
  return item?.uuid ?? item?.id ?? null;
}

function rememberNewlyCreatedItem(item, userId) {
  if (userId !== game.user.id) return;
  const key = itemTrackingKey(item);
  if (!key) return;
  newlyCreatedItemKeys.add(key);
  setTimeout(() => newlyCreatedItemKeys.delete(key), 300000);
}

function isNewlyCreatedItemSheet(app) {
  if (app?.__pf1eRuNewItemSheet) return true;
  const item = app?.item
    ?? (app?.object?.documentName === "Item" ? app.object : null)
    ?? (app?.document?.documentName === "Item" ? app.document : null);
  const key = itemTrackingKey(item);
  if (!key || !newlyCreatedItemKeys.has(key)) return false;
  newlyCreatedItemKeys.delete(key);
  app.__pf1eRuNewItemSheet = true;
  return true;
}

function trackConsumableIconChoice(app, root) {
  if (!isRussian() || !(root instanceof HTMLElement)) return;
  const classes = app?.options?.classes ?? [];
  const appElement = app?.element?.[0] ?? app?.element;
  const dialogRoot = appElement instanceof HTMLElement ? appElement : root;
  const isConsumableDialog = classes.includes?.("create-consumable")
    || dialogRoot.matches?.(".create-consumable")
    || dialogRoot.closest?.(".create-consumable");
  if (!isConsumableDialog) return;

  for (const button of dialogRoot.querySelectorAll("button[data-button]")) {
    button.addEventListener("click", () => {
      const type = button.dataset.button;
      pendingConsumableIconChoice = type === "potion" || type === "wand"
        ? { type, createdAt: Date.now() }
        : null;
    }, { capture: true, once: true });
  }
}

function iconPickerContent(type) {
  const choices = CONSUMABLE_ICONS[type] ?? [];
  const items = choices.map(({ label, img }, index) => `
    <label class="pf1e-ru-icon-choice" title="${label}">
      <input type="radio" name="pf1e-ru-consumable-icon" value="${img}" ${index === 0 ? "checked" : ""}>
      <img src="${img}" alt="${label}">
      <span>${label}</span>
    </label>
  `).join("");

  return `
    <p class="pf1e-ru-icon-picker-hint">Выберите изображение для созданного предмета.</p>
    <div class="pf1e-ru-icon-grid">${items}</div>
  `;
}

async function chooseConsumableIcon(item, type) {
  const noun = type === "potion" ? "зелья" : "жезла";
  const selected = await Dialog.wait({
    title: `Выберите иконку для ${noun}`,
    content: iconPickerContent(type),
    buttons: {
      apply: {
        icon: '<i class="fas fa-check"></i>',
        label: "Выбрать",
        callback: (html) => {
          const root = html?.[0] ?? html;
          return root?.querySelector?.('input[name="pf1e-ru-consumable-icon"]:checked')?.value ?? null;
        }
      },
      keep: {
        icon: '<i class="fas fa-undo"></i>',
        label: "Оставить текущую",
        callback: () => null
      }
    },
    default: "apply",
    close: () => null
  }, {
    classes: ["dialog", "pf1", "pf1e-ru-icon-picker"],
    width: 680
  });

  if (!selected) return;
  const update = { img: selected };
  if (item.system?.actions?.[0]) update["system.actions.0.img"] = selected;
  await item.update(update);
}

async function handleCreatedConsumable(item, _options, userId) {
  const pending = pendingConsumableIconChoice;
  if (!pending || userId !== game.user.id) return;
  if (Date.now() - pending.createdAt > 15000) {
    pendingConsumableIconChoice = null;
    return;
  }
  if (item.type !== "consumable" || item.system?.subType !== pending.type) return;

  pendingConsumableIconChoice = null;
  await chooseConsumableIcon(item, pending.type);
}

function isDomTranslationExcluded(element) {
  return element instanceof Element
    && (element.matches(DOM_TRANSLATION_EXCLUDED_SELECTOR)
      || Boolean(element.closest(DOM_TRANSLATION_EXCLUDED_SELECTOR)));
}

function translateElementAttributes(element) {
  if (!(element instanceof Element)) return;
  if (!element.matches("[placeholder], [title], [data-tooltip]")) return;

  for (const attribute of ["placeholder", "title", "data-tooltip"]) {
    if (!element.hasAttribute(attribute)) continue;
    const value = element.getAttribute(attribute);
    const translated = translateText(value);
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

function translateRenderedHtml(root) {
  if (!isRussian() || !(root instanceof HTMLElement) || isDomTranslationExcluded(root)) return;

  translateElementAttributes(root);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches(DOM_TRANSLATION_EXCLUDED_SELECTOR)) return NodeFilter.FILTER_REJECT;
          return node.matches("[placeholder], [title], [data-tooltip]")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      const translated = translateText(node.nodeValue);
      if (translated !== node.nodeValue) node.nodeValue = translated;
      continue;
    }

    translateElementAttributes(node);
  }
}

function replaceExactRenderedText(root, replacements) {
  if (!(root instanceof HTMLElement)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    const leading = value.match(/^\s*/)?.[0] ?? "";
    const trailing = value.match(/\s*$/)?.[0] ?? "";
    const content = value.slice(leading.length, value.length - trailing.length || undefined);
    const replacement = replacements[content];
    if (replacement !== undefined) node.nodeValue = `${leading}${replacement}${trailing}`;
  }

  for (const element of root.querySelectorAll("[placeholder], [title], [data-tooltip]")) {
    for (const attribute of ["placeholder", "title", "data-tooltip"]) {
      const value = element.getAttribute(attribute);
      if (value !== null && replacements[value] !== undefined) {
        element.setAttribute(attribute, replacements[value]);
      }
    }
  }
}

function translateDamageTypeSelector(root) {
  if (!isRussian() || !(root instanceof HTMLElement)) return;
  const selector = root.matches("form.pf1.damage-type-selector")
    ? root
    : root.querySelector("form.pf1.damage-type-selector");
  if (!selector) return;

  const translations = {
    Precision: "Точный",
    Untyped: "Без типа"
  };

  for (const label of selector.querySelectorAll(".damage-type .name")) {
    const value = label.textContent?.trim();
    if (translations[value]) label.textContent = translations[value];
  }
}

function translateItemApplication(app, root) {
  if (!isRussian() || !(root instanceof HTMLElement)) return;
  const item = app?.item
    ?? app?.action?.item
    ?? (app?.object?.documentName === "Item" ? app.object : null)
    ?? (app?.document?.documentName === "Item" ? app.document : null);
  const itemType = item?.type;
  if (!itemType) return;

  const common = {};
  if (itemType !== "spell") {
    Object.assign(common, {
      Properties: "Статус снаряжения",
      Propertires: "Статус снаряжения",
      Свойства: "Статус снаряжения"
    });
  } else if (itemType === "spell") {
    Object.assign(common, {
      Properties: "Статус заклинания",
      Propertires: "Статус заклинания",
      Свойства: "Статус заклинания"
    });
  }

  if (itemType === "class") {
    Object.assign(common, {
      "Hit Points": "Пункты здоровья",
      "Очки здоровья": "Пункты здоровья"
    });
    for (const progression of root.querySelectorAll(".spellcasting-progression")) {
      replaceExactRenderedText(progression, {
        High: "Высокое",
        Высокий: "Высокое",
        Medium: "Среднее",
        Средний: "Среднее",
        Low: "Низкое",
        Низкий: "Низкое"
      });
    }
  }

  const isActionEditor = Boolean(app?.action?.item) || Boolean(root.querySelector('input[name="touch"]'));
  if (isActionEditor) {
    for (const option of root.querySelectorAll('select[name="range.units"] option[value="touch"], select[name="range.minUnits"] option[value="touch"]')) {
      option.textContent = "Касание";
    }

    const touchInput = root.querySelector('input[name="touch"]');
    const touchLabel = touchInput?.closest("label");
    if (touchLabel) {
      for (const node of touchLabel.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue.trim()) continue;
        node.nodeValue = " Атакует по касанию";
      }
    }
  }

  replaceExactRenderedText(root, common);
}

function makeSettingsEditorResizable(app, root) {
  if (app?.id !== "settings-editor" || !(root instanceof HTMLElement)) return;
  const windowElement = app?.element?.[0] ?? root.closest(".window-app");
  if (!(windowElement instanceof HTMLElement)) return;

  windowElement.classList.add("pf1e-ru-resizable-settings");
  if (windowElement.querySelector(".pf1e-ru-settings-resize-handle")) return;

  const handle = document.createElement("div");
  handle.className = "window-resizable-handle pf1e-ru-settings-resize-handle";
  handle.title = "Изменить размер окна";
  handle.innerHTML = '<i class="fas fa-arrows-alt-h"></i>';
  windowElement.append(handle);

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const start = windowElement.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    handle.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => {
      const width = Math.max(480, Math.min(window.innerWidth - 20, start.width + moveEvent.clientX - startX));
      const height = Math.max(360, Math.min(window.innerHeight - 20, start.height + moveEvent.clientY - startY));
      app.setPosition?.({ width, height });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  });
}

function makeActorSheetResponsive(app, root) {
  if (!(root instanceof HTMLElement) || app?.object?.documentName !== "Actor") return;
  const windowElement = app?.element?.[0] ?? root.closest(".window-app");
  if (!(windowElement instanceof HTMLElement)) return;
  if (!windowElement.matches(".pf1alt.sheet.actor, .pf1e-pg-alt-sheet.sheet.actor")) return;

  const updateLayout = () => {
    const width = windowElement.getBoundingClientRect().width;
    windowElement.classList.toggle("pf1e-ru-compact-actor", width < 900);
    windowElement.classList.toggle("pf1e-ru-narrow-actor", width < 760);
  };

  const current = app.__pf1eRuResponsiveLayout;
  if (current?.element === windowElement) {
    current.update();
    return;
  }
  current?.observer?.disconnect();

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateLayout) : null;
  observer?.observe(windowElement);
  app.__pf1eRuResponsiveLayout = { element: windowElement, observer, update: updateLayout };
  updateLayout();
}

function installActorSheetTranslationObserver(app, root) {
  if (!isRussian() || !(root instanceof HTMLElement)) return;
  const current = app?.__pf1eRuTranslationObserver;
  if (current?.root === root) return;
  current?.observer?.disconnect();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        translateRenderedHtml(node);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  app.__pf1eRuTranslationObserver = { root, observer };
}

function redirectReferenceBooks(root) {
  if (!isRussian() || !(root instanceof HTMLElement)) return;

  for (const condition of root.querySelectorAll(".condition")) {
    const anchor = condition.querySelector("a.compendium-entry");
    const checkbox = condition.querySelector('[name^="system.attributes.conditions."]');
    const conditionKey = checkbox?.getAttribute("name")?.split(".").at(-1);
    const label = condition.textContent;
    const uuid = journalReferences.conditions.get(normalizeReference(conditionKey))
      ?? journalReferences.conditions.get(normalizeReference(label));
    if (anchor && uuid) {
      anchor.dataset.compendiumEntry = uuid;
      anchor.dataset.documentType = "JournalEntryPage";
      anchor.title = "Открыть русское описание состояния";
    }
  }

  for (const skillName of root.querySelectorAll(".skill-name")) {
    const anchor = skillName.querySelector("a.compendium-entry");
    const label = skillName.querySelector("h4")?.textContent;
    const uuid = journalReferences.skills.get(normalizeLabel(label));
    if (!anchor || !uuid) continue;
    anchor.dataset.compendiumEntry = uuid;
    anchor.dataset.documentType = "JournalEntryPage";
    anchor.title = "Открыть русское описание навыка";
  }
}

function enableSensesScrolling(root) {
  if (!(root instanceof HTMLElement)) return;
  for (const value of root.querySelectorAll("li.attribute.senses > .attribute-value")) {
    value.classList.add("scroll", "high");
  }
}

function processActorSheet(app, html) {
  const root = html?.[0] ?? html;
  translateRenderedHtml(root);
  installActorSheetTranslationObserver(app, root);
  redirectReferenceBooks(root);
  enableSensesScrolling(root);
  makeActorSheetResponsive(app, root);
}

Hooks.once("init", () => {
  registerAthleticsSetting();
  installModuleStyles();
  applyRussianTranslations();
  installPluralFormatting();
});

Hooks.once("ready", async () => {
  applyRussianTranslations();
  await collectCompendiumReferences();
  processRenderedChatMessages();

  if (game.settings.get(MODULE_ID, ATHLETICS_SETTING)) {
    await addAthleticsToExistingActors().catch(reportAthleticsError);
  }

  for (const application of Object.values(ui.windows)) {
    if (application?.object?.documentName === "Actor" && application.rendered) application.render(false);
  }
});

Hooks.on("renderActorSheet", processActorSheet);
Hooks.on("createActor", (actor) => {
  if (!game.settings.get(MODULE_ID, ATHLETICS_SETTING) || !isActiveGM()) return;
  void addAthleticsToActor(actor).catch(reportAthleticsError);
});
Hooks.on("closeActorSheet", (app) => {
  app?.__pf1eRuResponsiveLayout?.observer?.disconnect();
  app?.__pf1eRuTranslationObserver?.observer?.disconnect();
  delete app?.__pf1eRuResponsiveLayout;
  delete app?.__pf1eRuTranslationObserver;
});
Hooks.on("renderItemSheet", (app, html) => {
  if (!isNewlyCreatedItemSheet(app)) return;
  const root = html?.[0] ?? html;
  translateRenderedHtml(root);
  translateItemApplication(app, root);
});
Hooks.on("closeItemSheet", (app) => {
  const item = app?.item
    ?? (app?.object?.documentName === "Item" ? app.object : null)
    ?? (app?.document?.documentName === "Item" ? app.document : null);
  const key = itemTrackingKey(item);
  if (key) newlyCreatedItemKeys.delete(key);
  delete app?.__pf1eRuNewItemSheet;
});
Hooks.on("renderChatMessage", processChatMessage);
Hooks.on("pf1PreActorRollSkill", prepareRussianSkillRoll);
Hooks.on("pf1PreActorRollSave", prepareRussianSaveRoll);
Hooks.on("renderApplication", (app, html) => {
  const root = html?.[0] ?? html;
  if (app?.id === "settings-editor") translateRenderedHtml(root);
  makeSettingsEditorResizable(app, root);
});
Hooks.on("renderDialog", (app, html) => {
  const root = html?.[0] ?? html;
  const isCreation = isItemCreationDialog(app, root);
  if (!isCreation && !isActorRollDialog(app, root)) return;
  translateRenderedHtml(root);
  if (isCreation) trackConsumableIconChoice(app, root);
});
Hooks.on("renderSensesSelector", (_app, html) => translateRenderedHtml(html?.[0] ?? html));
Hooks.on("renderDamageTypeSelector", (_app, html) => translateDamageTypeSelector(html?.[0] ?? html));
Hooks.on("renderTokenConfig", (_app, html) => translateRenderedHtml(html?.[0] ?? html));
Hooks.on("createItem", (item, options, userId) => {
  rememberNewlyCreatedItem(item, userId);
  void handleCreatedConsumable(item, options, userId);
});
