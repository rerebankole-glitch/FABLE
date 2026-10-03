// Marketplace / interface localisation.
//
// The game ships full menu dictionaries in Settings.ts (LANGUAGES). Those stay short — one block
// of hand-written strings per language — because every entry there has to cover the whole title
// screen, world creation and the pause menu. The marketplace needs a much larger, more specific
// vocabulary (store categories, price labels, dressing-room tools, coin claims), so it keeps its
// own dictionary here: `${code}` adds a language for the store *and* everything else falls back to
// English for the handful of keys it does not define yet.
//
// Adding a language = one entry below. Missing keys fall back to English, never to a blank label.

import { settings } from '../game/core/Settings';

export type Dict = Record<string, string>;

export interface MarketLanguage {
  /** English name (used for sorting/diagnostics) */
  name: string;
  /** Endonym, shown in the language picker */
  native: string;
  dict: Dict;
}

const en: Dict = {
  marketplace: 'Marketplace', back: 'Back', done: 'Done', reset: 'Reset', save_equip: 'Save & Equip', language: 'Language',
  search_placeholder: 'Search skins…', available_balance: 'Available Balance', fable_coins: 'Fable Coins', free_claims: 'Free Claims',
  nav_skins: 'Skins & Outfits', nav_dressing: 'Dressing Room', nav_packs: 'Resource Packs', nav_shaders: 'Shader Add-ons',
  nav_mods: 'Client Mods', nav_themes: 'Store Themes', nav_coins: 'Get Coins (Free)',
  new: 'New', popular: 'Popular', free: 'Free', owned: 'Owned', equipped: 'Equipped', installed: 'Installed',
  equip: 'Equip', unlock_equip: 'Unlock & Equip', not_enough_coins: 'Not Enough Coins', import_skin: 'Import Skin PNG',
  install_free: 'Install Free', uninstall: 'Uninstall', save_zip: 'Save .zip', download_png: 'Download PNG',
  featured: 'Featured', new_and_featured: 'New & Featured', original_skin: 'Original FABLE skin', skins: 'Skins',
  all: 'All', classic: 'Classic', slim: 'Slim', no_results: 'No matching skins.',
  dressing_title: 'Dressing Room & Character Creator', avatar_colours: 'Avatar Colours', headwear: 'Headwear', presets: 'Presets',
  body_tone: 'Body / Skin Tone', hair_colour: 'Hair Colour', shirt_top: 'Shirt / Top', pants_bottom: 'Pants / Bottom', arm_proportions: 'Arm Proportions',
  welcome_gift: 'Welcome Gift', daily_gift: 'Daily Gift', claim: 'Claim +{n} Coins', claimed: 'Claimed',
  how_to_earn: 'How to Earn Fable Coins', current_balance: 'Current Balance',
  ore_block: 'Ore Block', rarity: 'Rarity', coin_reward: 'Coin Reward',
};

const es: Dict = {
  marketplace: 'Tienda', back: 'Atrás', done: 'Listo', reset: 'Restablecer', save_equip: 'Guardar y equipar', language: 'Idioma',
  search_placeholder: 'Buscar aspectos…', available_balance: 'Saldo disponible', fable_coins: 'Monedas Fable', free_claims: 'Regalos gratis',
  nav_skins: 'Aspectos y trajes', nav_dressing: 'Vestidor', nav_packs: 'Paquetes de recursos', nav_shaders: 'Complementos de sombreado',
  nav_mods: 'Mods de cliente', nav_themes: 'Temas de la tienda', nav_coins: 'Consigue monedas (gratis)',
  new: 'Nuevo', popular: 'Popular', free: 'Gratis', owned: 'En propiedad', equipped: 'Equipado', installed: 'Instalado',
  equip: 'Equipar', unlock_equip: 'Desbloquear y equipar', not_enough_coins: 'Monedas insuficientes', import_skin: 'Importar PNG de aspecto',
  install_free: 'Instalar gratis', uninstall: 'Desinstalar', save_zip: 'Guardar .zip', download_png: 'Descargar PNG',
  featured: 'Destacado', new_and_featured: 'Novedades y destacados', original_skin: 'Aspecto original de FABLE', skins: 'Aspectos',
  all: 'Todos', classic: 'Clásico', slim: 'Delgado', no_results: 'No hay aspectos que coincidan.',
  dressing_title: 'Vestidor y creador de personajes', avatar_colours: 'Colores del avatar', headwear: 'Tocados', presets: 'Preajustes',
  body_tone: 'Tono de piel', hair_colour: 'Color de pelo', shirt_top: 'Camiseta / Torso', pants_bottom: 'Pantalón / Piernas', arm_proportions: 'Proporciones de brazos',
  welcome_gift: 'Regalo de bienvenida', daily_gift: 'Regalo diario', claim: 'Reclamar +{n} monedas', claimed: 'Reclamado',
  how_to_earn: 'Cómo ganar monedas Fable', current_balance: 'Saldo actual',
  ore_block: 'Mena', rarity: 'Rareza', coin_reward: 'Recompensa',
};

const fr: Dict = {
  marketplace: 'Boutique', back: 'Retour', done: 'Terminé', reset: 'Réinitialiser', save_equip: 'Enregistrer et équiper', language: 'Langue',
  search_placeholder: 'Rechercher des skins…', available_balance: 'Solde disponible', fable_coins: 'Pièces Fable', free_claims: 'Cadeaux gratuits',
  nav_skins: 'Skins et tenues', nav_dressing: 'Cabine d’essayage', nav_packs: 'Packs de ressources', nav_shaders: 'Modules de shaders',
  nav_mods: 'Mods client', nav_themes: 'Thèmes de la boutique', nav_coins: 'Obtenir des pièces (gratuit)',
  new: 'Nouveau', popular: 'Populaire', free: 'Gratuit', owned: 'Possédé', equipped: 'Équipé', installed: 'Installé',
  equip: 'Équiper', unlock_equip: 'Débloquer et équiper', not_enough_coins: 'Pièces insuffisantes', import_skin: 'Importer un PNG de skin',
  install_free: 'Installer gratuitement', uninstall: 'Désinstaller', save_zip: 'Enregistrer le .zip', download_png: 'Télécharger le PNG',
  featured: 'À la une', new_and_featured: 'Nouveautés et à la une', original_skin: 'Skin original FABLE', skins: 'Skins',
  all: 'Tous', classic: 'Classique', slim: 'Fin', no_results: 'Aucun skin correspondant.',
  dressing_title: 'Cabine d’essayage et création de personnage', avatar_colours: 'Couleurs de l’avatar', headwear: 'Couvre-chefs', presets: 'Préréglages',
  body_tone: 'Teint / couleur de peau', hair_colour: 'Couleur des cheveux', shirt_top: 'Haut / tee-shirt', pants_bottom: 'Bas / pantalon', arm_proportions: 'Proportions des bras',
  welcome_gift: 'Cadeau de bienvenue', daily_gift: 'Cadeau quotidien', claim: 'Réclamer +{n} pièces', claimed: 'Réclamé',
  how_to_earn: 'Comment gagner des pièces Fable', current_balance: 'Solde actuel',
  ore_block: 'Minerai', rarity: 'Rareté', coin_reward: 'Récompense',
};

const de: Dict = {
  marketplace: 'Marktplatz', back: 'Zurück', done: 'Fertig', reset: 'Zurücksetzen', save_equip: 'Speichern & anlegen', language: 'Sprache',
  search_placeholder: 'Skins suchen…', available_balance: 'Verfügbares Guthaben', fable_coins: 'Fable-Münzen', free_claims: 'Gratis-Geschenke',
  nav_skins: 'Skins & Outfits', nav_dressing: 'Ankleidezimmer', nav_packs: 'Ressourcenpakete', nav_shaders: 'Shader-Erweiterungen',
  nav_mods: 'Client-Mods', nav_themes: 'Shop-Designs', nav_coins: 'Münzen holen (gratis)',
  new: 'Neu', popular: 'Beliebt', free: 'Gratis', owned: 'Im Besitz', equipped: 'Angelegt', installed: 'Installiert',
  equip: 'Anlegen', unlock_equip: 'Freischalten & anlegen', not_enough_coins: 'Nicht genug Münzen', import_skin: 'Skin-PNG importieren',
  install_free: 'Gratis installieren', uninstall: 'Deinstallieren', save_zip: 'Als .zip speichern', download_png: 'PNG herunterladen',
  featured: 'Empfohlen', new_and_featured: 'Neu & empfohlen', original_skin: 'Originaler FABLE-Skin', skins: 'Skins',
  all: 'Alle', classic: 'Klassisch', slim: 'Schlank', no_results: 'Keine passenden Skins.',
  dressing_title: 'Ankleidezimmer & Charakter-Editor', avatar_colours: 'Avatar-Farben', headwear: 'Kopfbedeckungen', presets: 'Vorlagen',
  body_tone: 'Hautton', hair_colour: 'Haarfarbe', shirt_top: 'Hemd / Oberteil', pants_bottom: 'Hose / Unterteil', arm_proportions: 'Armproportionen',
  welcome_gift: 'Willkommensgeschenk', daily_gift: 'Tägliches Geschenk', claim: '+{n} Münzen abholen', claimed: 'Abgeholt',
  how_to_earn: 'So verdienst du Fable-Münzen', current_balance: 'Aktuelles Guthaben',
  ore_block: 'Erzblock', rarity: 'Seltenheit', coin_reward: 'Münzbelohnung',
};

const it: Dict = {
  marketplace: 'Negozio', back: 'Indietro', done: 'Fatto', reset: 'Ripristina', save_equip: 'Salva ed equipaggia', language: 'Lingua',
  search_placeholder: 'Cerca skin…', available_balance: 'Saldo disponibile', fable_coins: 'Monete Fable', free_claims: 'Regali gratuiti',
  nav_skins: 'Skin e outfit', nav_dressing: 'Camerino', nav_packs: 'Pacchetti di risorse', nav_shaders: 'Componenti shader',
  nav_mods: 'Mod client', nav_themes: 'Temi del negozio', nav_coins: 'Ottieni monete (gratis)',
  new: 'Nuovo', popular: 'Popolare', free: 'Gratis', owned: 'Posseduto', equipped: 'Equipaggiato', installed: 'Installato',
  equip: 'Equipaggia', unlock_equip: 'Sblocca ed equipaggia', not_enough_coins: 'Monete insufficienti', import_skin: 'Importa PNG della skin',
  install_free: 'Installa gratis', uninstall: 'Disinstalla', save_zip: 'Salva .zip', download_png: 'Scarica PNG',
  featured: 'In evidenza', new_and_featured: 'Novità ed evidenza', original_skin: 'Skin originale FABLE', skins: 'Skin',
  all: 'Tutte', classic: 'Classico', slim: 'Snello', no_results: 'Nessuna skin corrispondente.',
  dressing_title: 'Camerino e creazione del personaggio', avatar_colours: 'Colori dell’avatar', headwear: 'Copricapi', presets: 'Preimpostazioni',
  body_tone: 'Tono della pelle', hair_colour: 'Colore dei capelli', shirt_top: 'Maglia / Busto', pants_bottom: 'Pantaloni / Gambe', arm_proportions: 'Proporzioni delle braccia',
  welcome_gift: 'Regalo di benvenuto', daily_gift: 'Regalo giornaliero', claim: 'Riscatta +{n} monete', claimed: 'Riscattato',
  how_to_earn: 'Come guadagnare monete Fable', current_balance: 'Saldo attuale',
  ore_block: 'Minerale', rarity: 'Rarità', coin_reward: 'Ricompensa',
};

const pt: Dict = {
  marketplace: 'Loja', back: 'Voltar', done: 'Concluído', reset: 'Redefinir', save_equip: 'Salvar e equipar', language: 'Idioma',
  search_placeholder: 'Pesquisar skins…', available_balance: 'Saldo disponível', fable_coins: 'Moedas Fable', free_claims: 'Brindes grátis',
  nav_skins: 'Skins e trajes', nav_dressing: 'Provador', nav_packs: 'Pacotes de recursos', nav_shaders: 'Complementos de shader',
  nav_mods: 'Mods de cliente', nav_themes: 'Temas da loja', nav_coins: 'Ganhar moedas (grátis)',
  new: 'Novo', popular: 'Popular', free: 'Grátis', owned: 'Adquirido', equipped: 'Equipado', installed: 'Instalado',
  equip: 'Equipar', unlock_equip: 'Desbloquear e equipar', not_enough_coins: 'Moedas insuficientes', import_skin: 'Importar PNG de skin',
  install_free: 'Instalar grátis', uninstall: 'Desinstalar', save_zip: 'Salvar .zip', download_png: 'Baixar PNG',
  featured: 'Em destaque', new_and_featured: 'Novidades e destaques', original_skin: 'Skin original FABLE', skins: 'Skins',
  all: 'Todas', classic: 'Clássico', slim: 'Fino', no_results: 'Nenhuma skin encontrada.',
  dressing_title: 'Provador e criação de personagem', avatar_colours: 'Cores do avatar', headwear: 'Chapéus', presets: 'Predefinições',
  body_tone: 'Tom de pele', hair_colour: 'Cor do cabelo', shirt_top: 'Camisa / Tronco', pants_bottom: 'Calça / Pernas', arm_proportions: 'Proporções dos braços',
  welcome_gift: 'Presente de boas-vindas', daily_gift: 'Presente diário', claim: 'Resgatar +{n} moedas', claimed: 'Resgatado',
  how_to_earn: 'Como ganhar moedas Fable', current_balance: 'Saldo atual',
  ore_block: 'Minério', rarity: 'Raridade', coin_reward: 'Recompensa',
};

const nl: Dict = {
  marketplace: 'Marktplaats', back: 'Terug', done: 'Klaar', reset: 'Herstellen', save_equip: 'Opslaan en aantrekken', language: 'Taal',
  search_placeholder: 'Skins zoeken…', available_balance: 'Beschikbaar saldo', fable_coins: 'Fable-munten', free_claims: 'Gratis cadeaus',
  nav_skins: 'Skins en outfits', nav_dressing: 'Paskamer', nav_packs: 'Resourcepacks', nav_shaders: 'Shader-add-ons',
  nav_mods: 'Clientmods', nav_themes: 'Winkelthema’s', nav_coins: 'Munten halen (gratis)',
  new: 'Nieuw', popular: 'Populair', free: 'Gratis', owned: 'In bezit', equipped: 'Aangetrokken', installed: 'Geïnstalleerd',
  equip: 'Aantrekken', unlock_equip: 'Ontgrendelen en aantrekken', not_enough_coins: 'Niet genoeg munten', import_skin: 'Skin-PNG importeren',
  install_free: 'Gratis installeren', uninstall: 'Verwijderen', save_zip: '.zip opslaan', download_png: 'PNG downloaden',
  featured: 'Uitgelicht', new_and_featured: 'Nieuw en uitgelicht', original_skin: 'Originele FABLE-skin', skins: 'Skins',
  all: 'Alle', classic: 'Klassiek', slim: 'Slank', no_results: 'Geen skins gevonden.',
  dressing_title: 'Paskamer en personage-editor', avatar_colours: 'Avatar-kleuren', headwear: 'Hoofddeksels', presets: 'Voorinstellingen',
  body_tone: 'Huidskleur', hair_colour: 'Haarkleur', shirt_top: 'Shirt / bovenlijf', pants_bottom: 'Broek / benen', arm_proportions: 'Armverhoudingen',
  welcome_gift: 'Welkomstcadeau', daily_gift: 'Dagelijks cadeau', claim: '+{n} munten ophalen', claimed: 'Opgehaald',
  how_to_earn: 'Zo verdien je Fable-munten', current_balance: 'Huidig saldo',
  ore_block: 'Ertsblok', rarity: 'Zeldzaamheid', coin_reward: 'Muntbeloning',
};

const pl: Dict = {
  marketplace: 'Sklep', back: 'Wstecz', done: 'Gotowe', reset: 'Przywróć', save_equip: 'Zapisz i załóż', language: 'Język',
  search_placeholder: 'Szukaj skinów…', available_balance: 'Dostępne saldo', fable_coins: 'Monety Fable', free_claims: 'Darmowe prezenty',
  nav_skins: 'Skiny i stroje', nav_dressing: 'Przebieralnia', nav_packs: 'Pakiety zasobów', nav_shaders: 'Dodatki shaderów',
  nav_mods: 'Mody klienta', nav_themes: 'Motywy sklepu', nav_coins: 'Zdobądź monety (gratis)',
  new: 'Nowe', popular: 'Popularne', free: 'Gratis', owned: 'Posiadane', equipped: 'Założone', installed: 'Zainstalowane',
  equip: 'Załóż', unlock_equip: 'Odblokuj i załóż', not_enough_coins: 'Za mało monet', import_skin: 'Importuj PNG skina',
  install_free: 'Zainstaluj gratis', uninstall: 'Odinstaluj', save_zip: 'Zapisz .zip', download_png: 'Pobierz PNG',
  featured: 'Polecane', new_and_featured: 'Nowości i polecane', original_skin: 'Oryginalny skin FABLE', skins: 'Skiny',
  all: 'Wszystkie', classic: 'Klasyczny', slim: 'Smukły', no_results: 'Brak pasujących skinów.',
  dressing_title: 'Przebieralnia i kreator postaci', avatar_colours: 'Kolory awatara', headwear: 'Nakrycia głowy', presets: 'Ustawienia wstępne',
  body_tone: 'Odcień skóry', hair_colour: 'Kolor włosów', shirt_top: 'Koszulka / tors', pants_bottom: 'Spodnie / nogi', arm_proportions: 'Proporcje ramion',
  welcome_gift: 'Prezent powitalny', daily_gift: 'Prezent dzienny', claim: 'Odbierz +{n} monet', claimed: 'Odebrano',
  how_to_earn: 'Jak zdobyć monety Fable', current_balance: 'Bieżące saldo',
  ore_block: 'Ruda', rarity: 'Rzadkość', coin_reward: 'Nagroda',
};

const ru: Dict = {
  marketplace: 'Магазин', back: 'Назад', done: 'Готово', reset: 'Сбросить', save_equip: 'Сохранить и надеть', language: 'Язык',
  search_placeholder: 'Поиск скинов…', available_balance: 'Доступный баланс', fable_coins: 'Монеты Fable', free_claims: 'Бесплатные подарки',
  nav_skins: 'Скины и наряды', nav_dressing: 'Гардеробная', nav_packs: 'Наборы ресурсов', nav_shaders: 'Дополнения шейдеров',
  nav_mods: 'Клиентские моды', nav_themes: 'Темы магазина', nav_coins: 'Получить монеты (бесплатно)',
  new: 'Новое', popular: 'Популярное', free: 'Бесплатно', owned: 'Куплено', equipped: 'Надето', installed: 'Установлено',
  equip: 'Надеть', unlock_equip: 'Открыть и надеть', not_enough_coins: 'Недостаточно монет', import_skin: 'Импорт PNG скина',
  install_free: 'Установить бесплатно', uninstall: 'Удалить', save_zip: 'Сохранить .zip', download_png: 'Скачать PNG',
  featured: 'Рекомендуем', new_and_featured: 'Новое и рекомендуемое', original_skin: 'Оригинальный скин FABLE', skins: 'Скины',
  all: 'Все', classic: 'Классический', slim: 'Тонкий', no_results: 'Подходящих скинов нет.',
  dressing_title: 'Гардеробная и редактор персонажа', avatar_colours: 'Цвета персонажа', headwear: 'Головные уборы', presets: 'Пресеты',
  body_tone: 'Тон кожи', hair_colour: 'Цвет волос', shirt_top: 'Рубашка / торс', pants_bottom: 'Штаны / ноги', arm_proportions: 'Пропорции рук',
  welcome_gift: 'Приветственный подарок', daily_gift: 'Ежедневный подарок', claim: 'Получить +{n} монет', claimed: 'Получено',
  how_to_earn: 'Как заработать монеты Fable', current_balance: 'Текущий баланс',
  ore_block: 'Руда', rarity: 'Редкость', coin_reward: 'Награда',
};

const uk: Dict = {
  marketplace: 'Крамниця', back: 'Назад', done: 'Готово', reset: 'Скинути', save_equip: 'Зберегти й вдягти', language: 'Мова',
  search_placeholder: 'Пошук скінів…', available_balance: 'Доступний баланс', fable_coins: 'Монети Fable', free_claims: 'Безкоштовні подарунки',
  nav_skins: 'Скіни та вбрання', nav_dressing: 'Гардеробна', nav_packs: 'Набори ресурсів', nav_shaders: 'Доповнення шейдерів',
  nav_mods: 'Клієнтські моди', nav_themes: 'Теми крамниці', nav_coins: 'Отримати монети (безкоштовно)',
  new: 'Нове', popular: 'Популярне', free: 'Безкоштовно', owned: 'Придбано', equipped: 'Вдягнено', installed: 'Встановлено',
  equip: 'Вдягти', unlock_equip: 'Відкрити й вдягти', not_enough_coins: 'Недостатньо монет', import_skin: 'Імпорт PNG скіна',
  install_free: 'Встановити безкоштовно', uninstall: 'Видалити', save_zip: 'Зберегти .zip', download_png: 'Завантажити PNG',
  featured: 'Рекомендовані', new_and_featured: 'Нове та рекомендоване', original_skin: 'Оригінальний скін FABLE', skins: 'Скіни',
  all: 'Усі', classic: 'Класичний', slim: 'Тонкий', no_results: 'Відповідних скінів немає.',
  dressing_title: 'Гардеробна та редактор персонажа', avatar_colours: 'Кольори аватара', headwear: 'Головні убори', presets: 'Шаблони',
  body_tone: 'Тон шкіри', hair_colour: 'Колір волосся', shirt_top: 'Сорочка / торс', pants_bottom: 'Штани / ноги', arm_proportions: 'Пропорції рук',
  welcome_gift: 'Вітальний подарунок', daily_gift: 'Щоденний подарунок', claim: 'Отримати +{n} монет', claimed: 'Отримано',
  how_to_earn: 'Як заробити монети Fable', current_balance: 'Поточний баланс',
  ore_block: 'Руда', rarity: 'Рідкість', coin_reward: 'Нагорода',
};

const tr: Dict = {
  marketplace: 'Mağaza', back: 'Geri', done: 'Bitti', reset: 'Sıfırla', save_equip: 'Kaydet ve giy', language: 'Dil',
  search_placeholder: 'Skin ara…', available_balance: 'Kullanılabilir bakiye', fable_coins: 'Fable Parası', free_claims: 'Ücretsiz hediyeler',
  nav_skins: 'Skinler ve kıyafetler', nav_dressing: 'Giyinme odası', nav_packs: 'Kaynak paketleri', nav_shaders: 'Shader eklentileri',
  nav_mods: 'İstemci modları', nav_themes: 'Mağaza temaları', nav_coins: 'Para kazan (ücretsiz)',
  new: 'Yeni', popular: 'Popüler', free: 'Ücretsiz', owned: 'Sahip', equipped: 'Giyili', installed: 'Kurulu',
  equip: 'Giy', unlock_equip: 'Aç ve giy', not_enough_coins: 'Yeterli para yok', import_skin: 'Skin PNG’si içe aktar',
  install_free: 'Ücretsiz kur', uninstall: 'Kaldır', save_zip: '.zip kaydet', download_png: 'PNG indir',
  featured: 'Öne çıkanlar', new_and_featured: 'Yeni ve öne çıkanlar', original_skin: 'Özgün FABLE skini', skins: 'Skinler',
  all: 'Tümü', classic: 'Klasik', slim: 'İnce', no_results: 'Eşleşen skin yok.',
  dressing_title: 'Giyinme odası ve karakter oluşturma', avatar_colours: 'Avatar renkleri', headwear: 'Başlıklar', presets: 'Hazır ayarlar',
  body_tone: 'Ten rengi', hair_colour: 'Saç rengi', shirt_top: 'Gömlek / gövde', pants_bottom: 'Pantolon / bacaklar', arm_proportions: 'Kol oranları',
  welcome_gift: 'Hoş geldin hediyesi', daily_gift: 'Günlük hediye', claim: '+{n} para al', claimed: 'Alındı',
  how_to_earn: 'Fable parası nasıl kazanılır', current_balance: 'Güncel bakiye',
  ore_block: 'Cevher', rarity: 'Nadirlik', coin_reward: 'Ödül',
};

const sv: Dict = {
  marketplace: 'Marknad', back: 'Tillbaka', done: 'Klart', reset: 'Återställ', save_equip: 'Spara och ta på', language: 'Språk',
  search_placeholder: 'Sök skinn…', available_balance: 'Tillgängligt saldo', fable_coins: 'Fable-mynt', free_claims: 'Gratis gåvor',
  nav_skins: 'Skinn och outfits', nav_dressing: 'Omklädningsrum', nav_packs: 'Resurspaket', nav_shaders: 'Shader-tillägg',
  nav_mods: 'Klientmoddar', nav_themes: 'Butiksteman', nav_coins: 'Skaffa mynt (gratis)',
  new: 'Ny', popular: 'Populär', free: 'Gratis', owned: 'Ägd', equipped: 'Utrustad', installed: 'Installerad',
  equip: 'Ta på', unlock_equip: 'Lås upp och ta på', not_enough_coins: 'Inte tillräckligt med mynt', import_skin: 'Importera skin-PNG',
  install_free: 'Installera gratis', uninstall: 'Avinstallera', save_zip: 'Spara .zip', download_png: 'Ladda ner PNG',
  featured: 'Utvalt', new_and_featured: 'Nytt och utvalt', original_skin: 'Originalskinn från FABLE', skins: 'Skinn',
  all: 'Alla', classic: 'Klassisk', slim: 'Smal', no_results: 'Inga matchande skinn.',
  dressing_title: 'Omklädningsrum och karaktärsredigerare', avatar_colours: 'Avatarfärger', headwear: 'Huvudbonader', presets: 'Förval',
  body_tone: 'Hudton', hair_colour: 'Hårfärg', shirt_top: 'Tröja / överkropp', pants_bottom: 'Byxor / ben', arm_proportions: 'Armproportioner',
  welcome_gift: 'Välkomstgåva', daily_gift: 'Daglig gåva', claim: 'Hämta +{n} mynt', claimed: 'Hämtad',
  how_to_earn: 'Så tjänar du Fable-mynt', current_balance: 'Aktuellt saldo',
  ore_block: 'Malmblock', rarity: 'Sällsynthet', coin_reward: 'Myntbelöning',
};

const da: Dict = {
  marketplace: 'Marked', back: 'Tilbage', done: 'Færdig', reset: 'Nulstil', save_equip: 'Gem og tag på', language: 'Sprog',
  search_placeholder: 'Søg skins…', available_balance: 'Tilgængelig saldo', fable_coins: 'Fable-mønter', free_claims: 'Gratis gaver',
  nav_skins: 'Skins og outfits', nav_dressing: 'Omklædningsrum', nav_packs: 'Ressourcepakker', nav_shaders: 'Shader-tilføjelser',
  nav_mods: 'Klientmods', nav_themes: 'Butikstemaer', nav_coins: 'Få mønter (gratis)',
  new: 'Ny', popular: 'Populær', free: 'Gratis', owned: 'Ejet', equipped: 'På', installed: 'Installeret',
  equip: 'Tag på', unlock_equip: 'Lås op og tag på', not_enough_coins: 'Ikke nok mønter', import_skin: 'Importér skin-PNG',
  install_free: 'Installér gratis', uninstall: 'Afinstallér', save_zip: 'Gem .zip', download_png: 'Download PNG',
  featured: 'Fremhævet', new_and_featured: 'Nyt og fremhævet', original_skin: 'Originalt FABLE-skin', skins: 'Skins',
  all: 'Alle', classic: 'Klassisk', slim: 'Slank', no_results: 'Ingen matchende skins.',
  dressing_title: 'Omklædningsrum og karaktereditor', avatar_colours: 'Avatarfarver', headwear: 'Hovedbeklædning', presets: 'Forudindstillinger',
  body_tone: 'Hudtone', hair_colour: 'Hårfarve', shirt_top: 'Trøje / overkrop', pants_bottom: 'Bukser / ben', arm_proportions: 'Armproportioner',
  welcome_gift: 'Velkomstgave', daily_gift: 'Daglig gave', claim: 'Hent +{n} mønter', claimed: 'Hentet',
  how_to_earn: 'Sådan tjener du Fable-mønter', current_balance: 'Nuværende saldo',
  ore_block: 'Malmblok', rarity: 'Sjældenhed', coin_reward: 'Møntbelønning',
};

const cs: Dict = {
  marketplace: 'Obchod', back: 'Zpět', done: 'Hotovo', reset: 'Obnovit', save_equip: 'Uložit a obléknout', language: 'Jazyk',
  search_placeholder: 'Hledat skiny…', available_balance: 'Dostupný zůstatek', fable_coins: 'Fable mince', free_claims: 'Dárky zdarma',
  nav_skins: 'Skiny a oblečení', nav_dressing: 'Převlékárna', nav_packs: 'Balíčky zdrojů', nav_shaders: 'Doplňky shaderů',
  nav_mods: 'Klientské mody', nav_themes: 'Motivy obchodu', nav_coins: 'Získat mince (zdarma)',
  new: 'Nové', popular: 'Oblíbené', free: 'Zdarma', owned: 'Vlastněno', equipped: 'Nasaženo', installed: 'Nainstalováno',
  equip: 'Nasadit', unlock_equip: 'Odemknout a nasadit', not_enough_coins: 'Nedostatek mincí', import_skin: 'Importovat PNG skinu',
  install_free: 'Nainstalovat zdarma', uninstall: 'Odinstalovat', save_zip: 'Uložit .zip', download_png: 'Stáhnout PNG',
  featured: 'Doporučeno', new_and_featured: 'Nové a doporučené', original_skin: 'Původní skin FABLE', skins: 'Skiny',
  all: 'Vše', classic: 'Klasický', slim: 'Štíhlý', no_results: 'Žádné odpovídající skiny.',
  dressing_title: 'Převlékárna a editor postavy', avatar_colours: 'Barvy avatara', headwear: 'Pokrývky hlavy', presets: 'Předvolby',
  body_tone: 'Odstín pleti', hair_colour: 'Barva vlasů', shirt_top: 'Tričko / trup', pants_bottom: 'Kalhoty / nohy', arm_proportions: 'Poměry paží',
  welcome_gift: 'Uvítací dárek', daily_gift: 'Denní dárek', claim: 'Vzít +{n} mincí', claimed: 'Převzato',
  how_to_earn: 'Jak získat Fable mince', current_balance: 'Aktuální zůstatek',
  ore_block: 'Ruda', rarity: 'Vzácnost', coin_reward: 'Odměna',
};

const ro: Dict = {
  marketplace: 'Magazin', back: 'Înapoi', done: 'Gata', reset: 'Resetează', save_equip: 'Salvează și echipează', language: 'Limbă',
  search_placeholder: 'Caută skinuri…', available_balance: 'Sold disponibil', fable_coins: 'Monede Fable', free_claims: 'Cadouri gratuite',
  nav_skins: 'Skinuri și ținute', nav_dressing: 'Cameră de probă', nav_packs: 'Pachete de resurse', nav_shaders: 'Suplimente shader',
  nav_mods: 'Moduri de client', nav_themes: 'Temele magazinului', nav_coins: 'Obține monede (gratuit)',
  new: 'Nou', popular: 'Popular', free: 'Gratuit', owned: 'Deținut', equipped: 'Echipat', installed: 'Instalat',
  equip: 'Echipează', unlock_equip: 'Deblochează și echipează', not_enough_coins: 'Monede insuficiente', import_skin: 'Importă PNG de skin',
  install_free: 'Instalează gratuit', uninstall: 'Dezinstalează', save_zip: 'Salvează .zip', download_png: 'Descarcă PNG',
  featured: 'Recomandat', new_and_featured: 'Nou și recomandat', original_skin: 'Skin original FABLE', skins: 'Skinuri',
  all: 'Toate', classic: 'Clasic', slim: 'Subțire', no_results: 'Niciun skin potrivit.',
  dressing_title: 'Cameră de probă și creator de personaje', avatar_colours: 'Culorile avatarului', headwear: 'Acoperăminte', presets: 'Presetări',
  body_tone: 'Tonul pielii', hair_colour: 'Culoarea părului', shirt_top: 'Tricou / trunchi', pants_bottom: 'Pantaloni / picioare', arm_proportions: 'Proporțiile brațelor',
  welcome_gift: 'Cadou de bun venit', daily_gift: 'Cadou zilnic', claim: 'Revendică +{n} monede', claimed: 'Revendicat',
  how_to_earn: 'Cum câștigi monede Fable', current_balance: 'Sold actual',
  ore_block: 'Minereu', rarity: 'Raritate', coin_reward: 'Recompensă',
};

const el: Dict = {
  marketplace: 'Κατάστημα', back: 'Πίσω', done: 'Τέλος', reset: 'Επαναφορά', save_equip: 'Αποθήκευση και εξοπλισμός', language: 'Γλώσσα',
  search_placeholder: 'Αναζήτηση skin…', available_balance: 'Διαθέσιμο υπόλοιπο', fable_coins: 'Νομίσματα Fable', free_claims: 'Δωρεάν δώρα',
  nav_skins: 'Skin και στολές', nav_dressing: 'Δοκιμαστήριο', nav_packs: 'Πακέτα πόρων', nav_shaders: 'Πρόσθετα shader',
  nav_mods: 'Mods πελάτη', nav_themes: 'Θέματα καταστήματος', nav_coins: 'Πάρε νομίσματα (δωρεάν)',
  new: 'Νέο', popular: 'Δημοφιλές', free: 'Δωρεάν', owned: 'Δικό σου', equipped: 'Εξοπλισμένο', installed: 'Εγκατεστημένο',
  equip: 'Εξοπλισμός', unlock_equip: 'Ξεκλείδωμα και εξοπλισμός', not_enough_coins: 'Λίγα νομίσματα', import_skin: 'Εισαγωγή PNG skin',
  install_free: 'Δωρεάν εγκατάσταση', uninstall: 'Απεγκατάσταση', save_zip: 'Αποθήκευση .zip', download_png: 'Λήψη PNG',
  featured: 'Προτεινόμενα', new_and_featured: 'Νέα και προτεινόμενα', original_skin: 'Αυθεντικό skin FABLE', skins: 'Skin',
  all: 'Όλα', classic: 'Κλασικό', slim: 'Λεπτό', no_results: 'Δεν βρέθηκαν skin.',
  dressing_title: 'Δοκιμαστήριο και δημιουργία χαρακτήρα', avatar_colours: 'Χρώματα avatar', headwear: 'Καλύμματα κεφαλής', presets: 'Προεπιλογές',
  body_tone: 'Τόνος δέρματος', hair_colour: 'Χρώμα μαλλιών', shirt_top: 'Μπλούζα / κορμός', pants_bottom: 'Παντελόνι / πόδια', arm_proportions: 'Αναλογίες χεριών',
  welcome_gift: 'Δώρο υποδοχής', daily_gift: 'Καθημερινό δώρο', claim: 'Διεκδίκηση +{n} νομισμάτων', claimed: 'Διεκδικήθηκε',
  how_to_earn: 'Πώς κερδίζεις νομίσματα Fable', current_balance: 'Τρέχον υπόλοιπο',
  ore_block: 'Μετάλλευμα', rarity: 'Σπανιότητα', coin_reward: 'Ανταμοιβή',
};

const hi: Dict = {
  marketplace: 'बाज़ार', back: 'वापस', done: 'पूरा', reset: 'रीसेट', save_equip: 'सेव करें और पहनें', language: 'भाषा',
  search_placeholder: 'स्किन खोजें…', available_balance: 'उपलब्ध शेष', fable_coins: 'फेबल सिक्के', free_claims: 'मुफ़्त उपहार',
  nav_skins: 'स्किन और पोशाक', nav_dressing: 'ड्रेसिंग रूम', nav_packs: 'रिसोर्स पैक', nav_shaders: 'शेडर ऐड-ऑन',
  nav_mods: 'क्लाइंट मॉड', nav_themes: 'स्टोर थीम', nav_coins: 'सिक्के पाएँ (मुफ़्त)',
  new: 'नया', popular: 'लोकप्रिय', free: 'मुफ़्त', owned: 'आपका', equipped: 'पहना हुआ', installed: 'इंस्टॉल',
  equip: 'पहनें', unlock_equip: 'अनलॉक करें और पहनें', not_enough_coins: 'सिक्के कम हैं', import_skin: 'स्किन PNG इंपोर्ट करें',
  install_free: 'मुफ़्त इंस्टॉल', uninstall: 'हटाएँ', save_zip: '.zip सेव करें', download_png: 'PNG डाउनलोड',
  featured: 'विशेष', new_and_featured: 'नया और विशेष', original_skin: 'मौलिक FABLE स्किन', skins: 'स्किन',
  all: 'सभी', classic: 'क्लासिक', slim: 'पतला', no_results: 'कोई स्किन नहीं मिली।',
  dressing_title: 'ड्रेसिंग रूम और कैरेक्टर क्रिएटर', avatar_colours: 'अवतार रंग', headwear: 'सिर के आभूषण', presets: 'प्रीसेट',
  body_tone: 'त्वचा का रंग', hair_colour: 'बालों का रंग', shirt_top: 'शर्ट / धड़', pants_bottom: 'पैंट / पैर', arm_proportions: 'बाज़ुओं का अनुपात',
  welcome_gift: 'स्वागत उपहार', daily_gift: 'दैनिक उपहार', claim: '+{n} सिक्के लें', claimed: 'लिया गया',
  how_to_earn: 'फेबल सिक्के कैसे कमाएँ', current_balance: 'वर्तमान शेष',
  ore_block: 'अयस्क', rarity: 'दुर्लभता', coin_reward: 'इनाम',
};

const id: Dict = {
  marketplace: 'Toko', back: 'Kembali', done: 'Selesai', reset: 'Setel ulang', save_equip: 'Simpan & pakai', language: 'Bahasa',
  search_placeholder: 'Cari skin…', available_balance: 'Saldo tersedia', fable_coins: 'Koin Fable', free_claims: 'Hadiah gratis',
  nav_skins: 'Skin & pakaian', nav_dressing: 'Ruang ganti', nav_packs: 'Paket sumber daya', nav_shaders: 'Add-on shader',
  nav_mods: 'Mod klien', nav_themes: 'Tema toko', nav_coins: 'Dapatkan koin (gratis)',
  new: 'Baru', popular: 'Populer', free: 'Gratis', owned: 'Dimiliki', equipped: 'Dipakai', installed: 'Terpasang',
  equip: 'Pakai', unlock_equip: 'Buka & pakai', not_enough_coins: 'Koin tidak cukup', import_skin: 'Impor PNG skin',
  install_free: 'Pasang gratis', uninstall: 'Copot', save_zip: 'Simpan .zip', download_png: 'Unduh PNG',
  featured: 'Unggulan', new_and_featured: 'Baru & unggulan', original_skin: 'Skin asli FABLE', skins: 'Skin',
  all: 'Semua', classic: 'Klasik', slim: 'Ramping', no_results: 'Tidak ada skin yang cocok.',
  dressing_title: 'Ruang ganti & pembuat karakter', avatar_colours: 'Warna avatar', headwear: 'Penutup kepala', presets: 'Prasetel',
  body_tone: 'Warna kulit', hair_colour: 'Warna rambut', shirt_top: 'Baju / badan', pants_bottom: 'Celana / kaki', arm_proportions: 'Proporsi lengan',
  welcome_gift: 'Hadiah selamat datang', daily_gift: 'Hadiah harian', claim: 'Klaim +{n} koin', claimed: 'Diklaim',
  how_to_earn: 'Cara mendapat koin Fable', current_balance: 'Saldo saat ini',
  ore_block: 'Bijih', rarity: 'Kelangkaan', coin_reward: 'Hadiah koin',
};

const vi: Dict = {
  marketplace: 'Cửa hàng', back: 'Quay lại', done: 'Xong', reset: 'Đặt lại', save_equip: 'Lưu và mặc', language: 'Ngôn ngữ',
  search_placeholder: 'Tìm skin…', available_balance: 'Số dư khả dụng', fable_coins: 'Xu Fable', free_claims: 'Quà miễn phí',
  nav_skins: 'Skin và trang phục', nav_dressing: 'Phòng thay đồ', nav_packs: 'Gói tài nguyên', nav_shaders: 'Tiện ích shader',
  nav_mods: 'Mod máy khách', nav_themes: 'Chủ đề cửa hàng', nav_coins: 'Nhận xu (miễn phí)',
  new: 'Mới', popular: 'Phổ biến', free: 'Miễn phí', owned: 'Đã sở hữu', equipped: 'Đang dùng', installed: 'Đã cài',
  equip: 'Mặc', unlock_equip: 'Mở khóa và mặc', not_enough_coins: 'Không đủ xu', import_skin: 'Nhập PNG skin',
  install_free: 'Cài miễn phí', uninstall: 'Gỡ bỏ', save_zip: 'Lưu .zip', download_png: 'Tải PNG',
  featured: 'Nổi bật', new_and_featured: 'Mới và nổi bật', original_skin: 'Skin gốc của FABLE', skins: 'Skin',
  all: 'Tất cả', classic: 'Cổ điển', slim: 'Mảnh', no_results: 'Không có skin phù hợp.',
  dressing_title: 'Phòng thay đồ và tạo nhân vật', avatar_colours: 'Màu nhân vật', headwear: 'Mũ', presets: 'Cài sẵn',
  body_tone: 'Tông da', hair_colour: 'Màu tóc', shirt_top: 'Áo / thân', pants_bottom: 'Quần / chân', arm_proportions: 'Tỉ lệ tay',
  welcome_gift: 'Quà chào mừng', daily_gift: 'Quà hằng ngày', claim: 'Nhận +{n} xu', claimed: 'Đã nhận',
  how_to_earn: 'Cách kiếm xu Fable', current_balance: 'Số dư hiện tại',
  ore_block: 'Quặng', rarity: 'Độ hiếm', coin_reward: 'Thưởng xu',
};

const ja: Dict = {
  marketplace: 'マーケットプレイス', back: '戻る', done: '完了', reset: 'リセット', save_equip: '保存して装着', language: '言語',
  search_placeholder: 'スキンを検索…', available_balance: '利用可能な残高', fable_coins: 'Fable コイン', free_claims: '無料ギフト',
  nav_skins: 'スキンと衣装', nav_dressing: 'ドレッシングルーム', nav_packs: 'リソースパック', nav_shaders: 'シェーダーアドオン',
  nav_mods: 'クライアントMOD', nav_themes: 'ストアテーマ', nav_coins: 'コインを入手（無料）',
  new: '新着', popular: '人気', free: '無料', owned: '購入済み', equipped: '装着中', installed: 'インストール済み',
  equip: '装着', unlock_equip: '解除して装着', not_enough_coins: 'コインが足りません', import_skin: 'スキンPNGを読み込む',
  install_free: '無料でインストール', uninstall: 'アンインストール', save_zip: '.zipを保存', download_png: 'PNGを保存',
  featured: 'おすすめ', new_and_featured: '新着とおすすめ', original_skin: 'FABLEオリジナルスキン', skins: 'スキン',
  all: 'すべて', classic: 'クラシック', slim: 'スリム', no_results: '該当するスキンがありません。',
  dressing_title: 'ドレッシングルームとキャラクター作成', avatar_colours: 'アバターの色', headwear: 'かぶりもの', presets: 'プリセット',
  body_tone: '肌の色', hair_colour: '髪の色', shirt_top: 'シャツ / 胴体', pants_bottom: 'ズボン / 脚', arm_proportions: '腕の比率',
  welcome_gift: 'ウェルカムギフト', daily_gift: 'デイリーギフト', claim: '+{n}コインを受け取る', claimed: '受け取り済み',
  how_to_earn: 'Fableコインの稼ぎ方', current_balance: '現在の残高',
  ore_block: '鉱石', rarity: 'レア度', coin_reward: '報酬',
};

const ko: Dict = {
  marketplace: '마켓플레이스', back: '뒤로', done: '완료', reset: '초기화', save_equip: '저장 및 착용', language: '언어',
  search_placeholder: '스킨 검색…', available_balance: '사용 가능한 잔액', fable_coins: 'Fable 코인', free_claims: '무료 선물',
  nav_skins: '스킨 및 의상', nav_dressing: '드레싱룸', nav_packs: '리소스 팩', nav_shaders: '셰이더 애드온',
  nav_mods: '클라이언트 모드', nav_themes: '스토어 테마', nav_coins: '코인 받기 (무료)',
  new: '신규', popular: '인기', free: '무료', owned: '보유 중', equipped: '착용 중', installed: '설치됨',
  equip: '착용', unlock_equip: '해금 후 착용', not_enough_coins: '코인이 부족합니다', import_skin: '스킨 PNG 가져오기',
  install_free: '무료 설치', uninstall: '제거', save_zip: '.zip 저장', download_png: 'PNG 다운로드',
  featured: '추천', new_and_featured: '신규 및 추천', original_skin: 'FABLE 오리지널 스킨', skins: '스킨',
  all: '전체', classic: '클래식', slim: '슬림', no_results: '일치하는 스킨이 없습니다.',
  dressing_title: '드레싱룸 및 캐릭터 만들기', avatar_colours: '아바타 색상', headwear: '머리 장식', presets: '프리셋',
  body_tone: '피부색', hair_colour: '머리색', shirt_top: '셔츠 / 몸통', pants_bottom: '바지 / 다리', arm_proportions: '팔 비율',
  welcome_gift: '웰컴 선물', daily_gift: '일일 선물', claim: '+{n} 코인 받기', claimed: '받음',
  how_to_earn: 'Fable 코인 버는 방법', current_balance: '현재 잔액',
  ore_block: '광석', rarity: '희귀도', coin_reward: '보상',
};

const zh: Dict = {
  marketplace: '市场', back: '返回', done: '完成', reset: '重置', save_equip: '保存并装备', language: '语言',
  search_placeholder: '搜索皮肤…', available_balance: '可用余额', fable_coins: 'Fable 硬币', free_claims: '免费礼包',
  nav_skins: '皮肤与套装', nav_dressing: '更衣室', nav_packs: '资源包', nav_shaders: '光影插件',
  nav_mods: '客户端模组', nav_themes: '商店主题', nav_coins: '获取硬币（免费）',
  new: '新品', popular: '热门', free: '免费', owned: '已拥有', equipped: '已装备', installed: '已安装',
  equip: '装备', unlock_equip: '解锁并装备', not_enough_coins: '硬币不足', import_skin: '导入皮肤 PNG',
  install_free: '免费安装', uninstall: '卸载', save_zip: '保存 .zip', download_png: '下载 PNG',
  featured: '精选', new_and_featured: '新品与精选', original_skin: 'FABLE 原创皮肤', skins: '皮肤',
  all: '全部', classic: '经典', slim: '纤细', no_results: '没有匹配的皮肤。',
  dressing_title: '更衣室与角色创建', avatar_colours: '角色配色', headwear: '头饰', presets: '预设',
  body_tone: '肤色', hair_colour: '发色', shirt_top: '上衣 / 躯干', pants_bottom: '裤子 / 腿部', arm_proportions: '手臂比例',
  welcome_gift: '欢迎礼包', daily_gift: '每日礼包', claim: '领取 +{n} 硬币', claimed: '已领取',
  how_to_earn: '如何赚取 Fable 硬币', current_balance: '当前余额',
  ore_block: '矿石', rarity: '稀有度', coin_reward: '奖励',
};

const zhTW: Dict = {
  marketplace: '市集', back: '返回', done: '完成', reset: '重設', save_equip: '儲存並裝備', language: '語言',
  search_placeholder: '搜尋外觀…', available_balance: '可用餘額', fable_coins: 'Fable 金幣', free_claims: '免費禮物',
  nav_skins: '外觀與服裝', nav_dressing: '更衣室', nav_packs: '資源包', nav_shaders: '光影外掛',
  nav_mods: '客戶端模組', nav_themes: '商店主題', nav_coins: '取得金幣（免費）',
  new: '新品', popular: '熱門', free: '免費', owned: '已擁有', equipped: '已裝備', installed: '已安裝',
  equip: '裝備', unlock_equip: '解鎖並裝備', not_enough_coins: '金幣不足', import_skin: '匯入外觀 PNG',
  install_free: '免費安裝', uninstall: '解除安裝', save_zip: '儲存 .zip', download_png: '下載 PNG',
  featured: '精選', new_and_featured: '新品與精選', original_skin: 'FABLE 原創外觀', skins: '外觀',
  all: '全部', classic: '經典', slim: '纖細', no_results: '沒有符合的外觀。',
  dressing_title: '更衣室與角色建立', avatar_colours: '角色配色', headwear: '頭飾', presets: '預設',
  body_tone: '膚色', hair_colour: '髮色', shirt_top: '上衣 / 軀幹', pants_bottom: '褲子 / 腿部', arm_proportions: '手臂比例',
  welcome_gift: '歡迎禮物', daily_gift: '每日禮物', claim: '領取 +{n} 金幣', claimed: '已領取',
  how_to_earn: '如何賺取 Fable 金幣', current_balance: '目前餘額',
  ore_block: '礦石', rarity: '稀有度', coin_reward: '獎勵',
};

function lang(name: string, native: string, dict: Dict): MarketLanguage {
  return { name, native, dict };
}

/**
 * Interface languages for the store. Every entry falls back to English per key, so a language can
 * be added (or expanded) one label at a time without ever showing a blank button.
 */
export const MARKET_LANGUAGES: Record<string, MarketLanguage> = {
  en: lang('English', 'English', en),
  es: lang('Spanish', 'Español', es),
  fr: lang('French', 'Français', fr),
  de: lang('German', 'Deutsch', de),
  it: lang('Italian', 'Italiano', it),
  pt: lang('Portuguese (Brazil)', 'Português (BR)', pt),
  nl: lang('Dutch', 'Nederlands', nl),
  pl: lang('Polish', 'Polski', pl),
  ru: lang('Russian', 'Русский', ru),
  uk: lang('Ukrainian', 'Українська', uk),
  tr: lang('Turkish', 'Türkçe', tr),
  sv: lang('Swedish', 'Svenska', sv),
  da: lang('Danish', 'Dansk', da),
  cs: lang('Czech', 'Čeština', cs),
  ro: lang('Romanian', 'Română', ro),
  el: lang('Greek', 'Ελληνικά', el),
  hi: lang('Hindi', 'हिन्दी', hi),
  id: lang('Indonesian', 'Bahasa Indonesia', id),
  vi: lang('Vietnamese', 'Tiếng Việt', vi),
  ja: lang('Japanese', '日本語', ja),
  ko: lang('Korean', '한국어', ko),
  zh: lang('Chinese (Simplified)', '简体中文', zh),
  'zh-TW': lang('Chinese (Traditional)', '繁體中文', zhTW),
};

export const MARKET_LANGUAGE_CODES = Object.keys(MARKET_LANGUAGES);

/** The active language code, clamped to one we actually ship a dictionary for. */
export function marketLang(): string {
  const code = settings.value.language;
  return MARKET_LANGUAGES[code] ? code : 'en';
}

/**
 * Translate a store/interface key. `{name}` placeholders in the value are replaced from `vars`.
 * Unknown keys and untranslated entries fall back to English instead of leaking a raw key.
 */
export function mt(key: string, vars?: Record<string, string | number>): string {
  const dict = MARKET_LANGUAGES[marketLang()].dict;
  let text = dict[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/** Number formatting that follows the active language (grouping + decimal separators). */
export function mn(value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(marketLang(), options).format(value);
  } catch {
    return String(value);
  }
}
