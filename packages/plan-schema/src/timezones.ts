// Pinned time zone data. Nothing here reads from Intl, so the allowed names and the
// display names are identical on every runtime and every ICU version.
//
// Only canonical IANA primary names ("Region/City") plus "UTC" are allowed. Legacy links
// (US/Eastern, Asia/Calcutta), Etc/*, offsets, abbreviations, and wrong capitalization are not.

/** Generic (not daylight-saving-specific) display names, grouped by name. */
const NAMED: Record<string, string[]> = {
  "Eastern Time": [
    "America/New_York", "America/Detroit", "America/Toronto", "America/Nassau", "America/Port-au-Prince",
    "America/Indiana/Indianapolis", "America/Indiana/Marengo", "America/Indiana/Petersburg", "America/Indiana/Vevay",
    "America/Indiana/Vincennes", "America/Indiana/Winamac", "America/Kentucky/Louisville", "America/Kentucky/Monticello",
    "America/Cancun", "America/Panama", "America/Jamaica", "America/Cayman", "America/Grand_Turk", "America/Iqaluit",
  ],
  "Central Time": [
    "America/Chicago", "America/Winnipeg", "America/Mexico_City", "America/Menominee", "America/Matamoros",
    "America/Merida", "America/Monterrey", "America/Regina", "America/Swift_Current", "America/Rankin_Inlet",
    "America/Resolute", "America/Costa_Rica", "America/El_Salvador", "America/Guatemala", "America/Tegucigalpa",
    "America/Managua", "America/Belize", "America/Indiana/Knox", "America/Indiana/Tell_City",
    "America/North_Dakota/Beulah", "America/North_Dakota/Center", "America/North_Dakota/New_Salem",
  ],
  "Mountain Time": [
    "America/Denver", "America/Boise", "America/Edmonton", "America/Phoenix", "America/Ciudad_Juarez",
    "America/Chihuahua", "America/Hermosillo", "America/Mazatlan", "America/Yellowknife", "America/Cambridge_Bay",
    "America/Inuvik", "America/Creston", "America/Dawson_Creek", "America/Fort_Nelson",
  ],
  "Pacific Time": ["America/Los_Angeles", "America/Vancouver", "America/Tijuana"],
  "Alaska Time": ["America/Anchorage", "America/Juneau", "America/Nome", "America/Sitka", "America/Yakutat", "America/Metlakatla"],
  "Hawaii-Aleutian Time": ["Pacific/Honolulu", "America/Adak"],
  "Atlantic Time": [
    "America/Halifax", "America/Moncton", "America/Glace_Bay", "America/Goose_Bay", "America/Puerto_Rico",
    "America/Santo_Domingo", "America/Barbados", "America/Martinique", "America/Port_of_Spain", "America/Thule",
    "Atlantic/Bermuda",
  ],
  "Newfoundland Time": ["America/St_Johns"],
  "Argentina Time": [
    "America/Argentina/Buenos_Aires", "America/Argentina/Catamarca", "America/Argentina/Cordoba", "America/Argentina/Jujuy",
    "America/Argentina/La_Rioja", "America/Argentina/Mendoza", "America/Argentina/Rio_Gallegos", "America/Argentina/Salta",
    "America/Argentina/San_Juan", "America/Argentina/San_Luis", "America/Argentina/Tucuman", "America/Argentina/Ushuaia",
  ],
  "Brasilia Time": ["America/Sao_Paulo", "America/Bahia", "America/Belem", "America/Fortaleza", "America/Recife", "America/Maceio"],
  "Colombia Time": ["America/Bogota"],
  "Peru Time": ["America/Lima"],
  "Chile Time": ["America/Santiago"],
  "Venezuela Time": ["America/Caracas"],
  "Cuba Time": ["America/Havana"],
  "Greenwich Mean Time": ["Europe/London", "Europe/Dublin", "Atlantic/Reykjavik", "Africa/Abidjan", "Africa/Accra", "Africa/Dakar", "Africa/Monrovia", "Africa/Bamako"],
  "Central European Time": [
    "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Brussels",
    "Europe/Vienna", "Europe/Zurich", "Europe/Stockholm", "Europe/Oslo", "Europe/Copenhagen", "Europe/Prague",
    "Europe/Warsaw", "Europe/Budapest", "Europe/Belgrade", "Europe/Zagreb", "Europe/Ljubljana", "Europe/Bratislava",
    "Europe/Luxembourg", "Europe/Malta", "Europe/Monaco", "Europe/Andorra", "Europe/Vaduz", "Europe/San_Marino",
    "Europe/Vatican", "Europe/Sarajevo", "Europe/Skopje", "Europe/Podgorica", "Europe/Tirane", "Europe/Gibraltar",
    "Africa/Tunis", "Africa/Algiers", "Africa/Ceuta",
  ],
  "Western European Time": ["Europe/Lisbon", "Atlantic/Canary", "Atlantic/Madeira", "Atlantic/Faroe"],
  "Eastern European Time": [
    "Europe/Athens", "Europe/Helsinki", "Europe/Kyiv", "Europe/Bucharest", "Europe/Sofia", "Europe/Riga",
    "Europe/Tallinn", "Europe/Vilnius", "Europe/Chisinau", "Africa/Cairo", "Africa/Tripoli", "Asia/Beirut",
    "Asia/Nicosia", "Asia/Famagusta",
  ],
  "Moscow Time": ["Europe/Moscow", "Europe/Minsk", "Europe/Simferopol", "Europe/Kirov", "Europe/Volgograd"],
  "Turkey Time": ["Europe/Istanbul"],
  "Israel Time": ["Asia/Jerusalem"],
  "Arabian Time": ["Asia/Riyadh", "Asia/Baghdad", "Asia/Kuwait", "Asia/Qatar", "Asia/Bahrain", "Asia/Aden"],
  "Gulf Time": ["Asia/Dubai", "Asia/Muscat"],
  "Iran Time": ["Asia/Tehran"],
  "Pakistan Time": ["Asia/Karachi"],
  "India Time": ["Asia/Kolkata"],
  "Sri Lanka Time": ["Asia/Colombo"],
  "Nepal Time": ["Asia/Kathmandu"],
  "Bangladesh Time": ["Asia/Dhaka"],
  "Indochina Time": ["Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Phnom_Penh", "Asia/Vientiane"],
  "Western Indonesia Time": ["Asia/Jakarta", "Asia/Pontianak"],
  "China Time": ["Asia/Shanghai", "Asia/Macau", "Asia/Urumqi"],
  "Hong Kong Time": ["Asia/Hong_Kong"],
  "Taiwan Time": ["Asia/Taipei"],
  "Singapore Time": ["Asia/Singapore"],
  "Malaysia Time": ["Asia/Kuala_Lumpur", "Asia/Kuching"],
  "Philippine Time": ["Asia/Manila"],
  "Japan Time": ["Asia/Tokyo"],
  "Korea Time": ["Asia/Seoul", "Asia/Pyongyang"],
  "East Africa Time": [
    "Africa/Nairobi", "Africa/Addis_Ababa", "Africa/Dar_es_Salaam", "Africa/Kampala", "Africa/Mogadishu",
    "Africa/Djibouti", "Africa/Asmara", "Indian/Antananarivo",
  ],
  "West Africa Time": ["Africa/Lagos", "Africa/Kinshasa", "Africa/Luanda", "Africa/Douala", "Africa/Libreville", "Africa/Niamey"],
  "Central Africa Time": ["Africa/Maputo", "Africa/Harare", "Africa/Lusaka", "Africa/Johannesburg", "Africa/Gaborone", "Africa/Khartoum", "Africa/Lubumbashi", "Africa/Windhoek", "Africa/Kigali"],
  "Morocco Time": ["Africa/Casablanca"],
  "Australian Eastern Time": ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Hobart", "Australia/Lindeman"],
  "Australian Central Time": ["Australia/Adelaide", "Australia/Darwin", "Australia/Broken_Hill"],
  "Australian Western Time": ["Australia/Perth"],
  "New Zealand Time": ["Pacific/Auckland"],
  "Fiji Time": ["Pacific/Fiji"],
  "Samoa Time": ["Pacific/Apia", "Pacific/Pago_Pago"],
  "Chamorro Time": ["Pacific/Guam"],
};

/** Allowed zones that have no pinned display name. They are shown by their IANA id. */
const UNNAMED: string[] = [
  "America/Anguilla", "America/Antigua", "America/Aruba", "America/Asuncion", "America/Atikokan",
  "America/Blanc-Sablon", "America/Boa_Vista", "America/Campo_Grande", "America/Cayenne", "America/Coyhaique",
  "America/Cuiaba", "America/Curacao", "America/Danmarkshavn", "America/Dawson", "America/Dominica", "America/Eirunepe",
  "America/Grenada", "America/Guadeloupe", "America/Guayaquil",
  "America/Guyana", "America/La_Paz", "America/Manaus", "America/Marigot", "America/Miquelon", "America/Montevideo",
  "America/Montserrat", "America/Noronha", "America/Nuuk", "America/Ojinaga", "America/Paramaribo", "America/Porto_Velho",
  "America/Punta_Arenas", "America/Rio_Branco", "America/Santarem", "America/Scoresbysund", "America/St_Barthelemy",
  "America/St_Kitts", "America/St_Lucia", "America/St_Thomas", "America/St_Vincent", "America/Tortola", "America/Whitehorse",
  "America/Lower_Princes", "America/Kralendijk", "America/Bahia_Banderas",
  "Africa/Bangui", "Africa/Banjul", "Africa/Bissau", "Africa/Blantyre", "Africa/Brazzaville",
  "Africa/Bujumbura", "Africa/Conakry", "Africa/El_Aaiun", "Africa/Freetown", "Africa/Juba", "Africa/Lome", "Africa/Malabo",
  "Africa/Maseru", "Africa/Mbabane", "Africa/Ndjamena", "Africa/Nouakchott", "Africa/Ouagadougou", "Africa/Porto-Novo",
  "Africa/Sao_Tome",
  "Asia/Almaty", "Asia/Amman", "Asia/Anadyr", "Asia/Aqtau", "Asia/Aqtobe", "Asia/Ashgabat", "Asia/Atyrau", "Asia/Baku",
  "Asia/Barnaul", "Asia/Bishkek", "Asia/Brunei", "Asia/Chita", "Asia/Damascus", "Asia/Dili", "Asia/Dushanbe", "Asia/Gaza",
  "Asia/Hebron", "Asia/Hovd", "Asia/Irkutsk", "Asia/Jayapura", "Asia/Kabul", "Asia/Kamchatka", "Asia/Khandyga",
  "Asia/Krasnoyarsk", "Asia/Magadan", "Asia/Makassar", "Asia/Novokuznetsk", "Asia/Novosibirsk", "Asia/Omsk", "Asia/Oral",
  "Asia/Qostanay", "Asia/Qyzylorda", "Asia/Sakhalin", "Asia/Samarkand", "Asia/Srednekolymsk", "Asia/Tashkent",
  "Asia/Tbilisi", "Asia/Thimphu", "Asia/Tomsk", "Asia/Ulaanbaatar", "Asia/Ust-Nera", "Asia/Vladivostok", "Asia/Yakutsk",
  "Asia/Yangon", "Asia/Yekaterinburg", "Asia/Yerevan",
  "Atlantic/Azores", "Atlantic/Cape_Verde", "Atlantic/South_Georgia", "Atlantic/St_Helena", "Atlantic/Stanley",
  "Australia/Eucla",
  "Europe/Astrakhan", "Europe/Busingen", "Europe/Guernsey", "Europe/Isle_of_Man", "Europe/Jersey", "Europe/Samara",
  "Europe/Saratov", "Europe/Ulyanovsk",
  "Indian/Chagos", "Indian/Christmas", "Indian/Cocos", "Indian/Comoro", "Indian/Kerguelen", "Indian/Mahe",
  "Indian/Maldives", "Indian/Mauritius", "Indian/Mayotte", "Indian/Reunion",
  "Pacific/Bougainville", "Pacific/Chatham", "Pacific/Chuuk", "Pacific/Easter", "Pacific/Efate", "Pacific/Fakaofo",
  "Pacific/Funafuti", "Pacific/Galapagos", "Pacific/Gambier", "Pacific/Guadalcanal", "Pacific/Kanton", "Pacific/Kiritimati",
  "Pacific/Kosrae", "Pacific/Kwajalein", "Pacific/Majuro", "Pacific/Marquesas", "Pacific/Midway", "Pacific/Nauru",
  "Pacific/Niue", "Pacific/Norfolk", "Pacific/Noumea", "Pacific/Palau", "Pacific/Pitcairn", "Pacific/Pohnpei",
  "Pacific/Port_Moresby", "Pacific/Rarotonga", "Pacific/Saipan", "Pacific/Tahiti", "Pacific/Tarawa", "Pacific/Tongatapu",
  "Pacific/Wake", "Pacific/Wallis",
];

const DISPLAY_NAMES = new Map<string, string>();
for (const [name, zones] of Object.entries(NAMED)) for (const z of zones) DISPLAY_NAMES.set(z, name);

/** Canonical IANA primary names (plus "UTC") accepted in a plan. */
export const TIME_ZONES: ReadonlySet<string> = new Set<string>(["UTC", ...DISPLAY_NAMES.keys(), ...UNNAMED]);

/** Pinned generic display name such as "Central Time", or undefined when the zone has none. */
export function zoneDisplayName(tz: string): string | undefined {
  return DISPLAY_NAMES.get(tz);
}
