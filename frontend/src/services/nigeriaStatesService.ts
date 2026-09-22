import { api } from './api';

export interface NigeriaState {
  name: string;
  fullName: string;
  stateCode?: string;
  terminal: string;
  hasActiveRoutes: boolean;
}

const STORAGE_KEY = 'transithub_nigeria_states_v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Verified static list of all 36 Nigerian States + FCT as bulletproof fallback
export const FALLBACK_NIGERIA_STATES: Array<{ name: string; fullName: string; stateCode?: string; terminal: string }> = [
  { name: 'Abia', fullName: 'Abia State', stateCode: 'NG-AB', terminal: 'Aba / Umuahia Terminal' },
  { name: 'Adamawa', fullName: 'Adamawa State', stateCode: 'NG-AD', terminal: 'Yola Main Terminal' },
  { name: 'Akwa Ibom', fullName: 'Akwa Ibom State', stateCode: 'NG-AK', terminal: 'Uyo Central Terminal' },
  { name: 'Anambra', fullName: 'Anambra State', stateCode: 'NG-AN', terminal: 'Onitsha / Awka Terminal' },
  { name: 'Bauchi', fullName: 'Bauchi State', stateCode: 'NG-BA', terminal: 'Bauchi Central Park' },
  { name: 'Bayelsa', fullName: 'Bayelsa State', stateCode: 'NG-BY', terminal: 'Yenagoa Transit Hub' },
  { name: 'Benue', fullName: 'Benue State', stateCode: 'NG-BE', terminal: 'Makurdi Main Terminal' },
  { name: 'Borno', fullName: 'Borno State', stateCode: 'NG-BO', terminal: 'Maiduguri Express Terminal' },
  { name: 'Cross River', fullName: 'Cross River State', stateCode: 'NG-CR', terminal: 'Calabar Central Park' },
  { name: 'Delta', fullName: 'Delta State', stateCode: 'NG-DE', terminal: 'Asaba / Warri Terminal' },
  { name: 'Ebonyi', fullName: 'Ebonyi State', stateCode: 'NG-EB', terminal: 'Abakaliki Terminal' },
  { name: 'Edo', fullName: 'Edo State', stateCode: 'NG-ED', terminal: 'Benin City (Ramat Park)' },
  { name: 'Ekiti', fullName: 'Ekiti State', stateCode: 'NG-EK', terminal: 'Ado-Ekiti Central Terminal' },
  { name: 'Enugu', fullName: 'Enugu State', stateCode: 'NG-EN', terminal: 'Enugu Holy Ghost Terminal' },
  { name: 'Federal Capital Territory', fullName: 'Federal Capital Territory (Abuja)', stateCode: 'NG-FC', terminal: 'Abuja (Utako Main Terminal)' },
  { name: 'Gombe', fullName: 'Gombe State', stateCode: 'NG-GO', terminal: 'Gombe Transit Terminal' },
  { name: 'Imo', fullName: 'Imo State', stateCode: 'NG-IM', terminal: 'Owerri Control Post Hub' },
  { name: 'Jigawa', fullName: 'Jigawa State', stateCode: 'NG-JI', terminal: 'Dutse Central Park' },
  { name: 'Kaduna', fullName: 'Kaduna State', stateCode: 'NG-KD', terminal: 'Kaduna Central Express Hub' },
  { name: 'Kano', fullName: 'Kano State', stateCode: 'NG-KN', terminal: 'Kano (Naibawa Terminal)' },
  { name: 'Katsina', fullName: 'Katsina State', stateCode: 'NG-KT', terminal: 'Katsina Inter-State Park' },
  { name: 'Kebbi', fullName: 'Kebbi State', stateCode: 'NG-KB', terminal: 'Birnin Kebbi Central Terminal' },
  { name: 'Kogi', fullName: 'Kogi State', stateCode: 'NG-KO', terminal: 'Lokoja Confluence Hub' },
  { name: 'Kwara', fullName: 'Kwara State', stateCode: 'NG-KW', terminal: 'Ilorin Post Office Terminal' },
  { name: 'Lagos', fullName: 'Lagos State', stateCode: 'NG-LA', terminal: 'Lagos (Jibowu / Ojota Terminus)' },
  { name: 'Nasarawa', fullName: 'Nasarawa State', stateCode: 'NG-NA', terminal: 'Lafia Express Park' },
  { name: 'Niger', fullName: 'Niger State', stateCode: 'NG-NI', terminal: 'Minna Central Terminal' },
  { name: 'Ogun', fullName: 'Ogun State', stateCode: 'NG-OG', terminal: 'Abeokuta Transit Park' },
  { name: 'Ondo', fullName: 'Ondo State', stateCode: 'NG-ON', terminal: 'Akure Inter-State Hub' },
  { name: 'Osun', fullName: 'Osun State', stateCode: 'NG-OS', terminal: 'Osogbo Central Terminal' },
  { name: 'Oyo', fullName: 'Oyo State', stateCode: 'NG-OY', terminal: 'Ibadan (Iwo Road / Challenge Hub)' },
  { name: 'Plateau', fullName: 'Plateau State', stateCode: 'NG-PL', terminal: 'Jos Plateau Main Park' },
  { name: 'Rivers', fullName: 'Rivers State', stateCode: 'NG-RI', terminal: 'Port Harcourt (Waterlines)' },
  { name: 'Sokoto', fullName: 'Sokoto State', stateCode: 'NG-SO', terminal: 'Sokoto Sultan Abubakar Hub' },
  { name: 'Taraba', fullName: 'Taraba State', stateCode: 'NG-TA', terminal: 'Jalingo Express Terminal' },
  { name: 'Yobe', fullName: 'Yobe State', stateCode: 'NG-YO', terminal: 'Damaturu Transit Terminal' },
  { name: 'Zamfara', fullName: 'Zamfara State', stateCode: 'NG-ZA', terminal: 'Gusau Central Park' }
];

const KNOWN_TERMINALS: Record<string, string> = {
  Lagos: 'Lagos (Jibowu Terminus)',
  'Federal Capital Territory': 'Abuja (Utako Park)',
  Abuja: 'Abuja (Utako Park)',
  FCT: 'Abuja (Utako Park)',
  Rivers: 'Port Harcourt (Waterlines)',
  Edo: 'Benin City (Ramat Park)',
  Kano: 'Kano (Naibawa Terminal)',
};

export const ACTIVE_HUB_CITIES = ['Lagos', 'Federal Capital Territory', 'Rivers', 'Edo', 'Kano'];

export async function fetchNigeriaStates(): Promise<{ states: NigeriaState[]; source: string }> {
  // Check local cache
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed.states) && parsed.states.length >= 36) {
        return { states: parsed.states, source: parsed.source || 'Local Cache' };
      }
    }
  } catch {
    // Ignore cache error
  }

  // 1. Try public online country API (countriesnow.space)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch('https://countriesnow.space/api/v0.1/countries/states/q?country=Nigeria', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data && data.error === false && Array.isArray(data.data?.states) && data.data.states.length > 0) {
        const mappedStates: NigeriaState[] = data.data.states.map((s: { name: string; state_code?: string }) => {
          const cleanName = s.name.replace(/\s*State\b/i, '').trim();
          const isFct = cleanName.toLowerCase().includes('federal capital') || cleanName.toLowerCase() === 'fct';
          const name = isFct ? 'Federal Capital Territory' : cleanName;
          const terminal = KNOWN_TERMINALS[name] || `${name} Central Terminal`;
          const hasActiveRoutes = ACTIVE_HUB_CITIES.includes(name);

          return {
            name,
            fullName: isFct ? 'Federal Capital Territory (Abuja)' : `${name} State`,
            stateCode: s.state_code,
            terminal,
            hasActiveRoutes,
          };
        });

        // Ensure sorted
        mappedStates.sort((a, b) => a.name.localeCompare(b.name));

        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ timestamp: Date.now(), states: mappedStates, source: 'Online Country API (countriesnow.space)' })
          );
        } catch {
          // ignore storage full
        }

        return { states: mappedStates, source: 'Online Country API (countriesnow.space)' };
      }
    }
  } catch {
    // Continue to backend fallback
  }

  // 2. Try backend cached proxy API (/api/states)
  try {
    const res = await api.get<{ states: Array<{ name: string; full_name: string; state_code?: string; terminal: string; has_active_routes: boolean }> }>('/states');
    if (res.data?.states?.length) {
      const states: NigeriaState[] = res.data.states.map(s => ({
        name: s.name,
        fullName: s.full_name,
        stateCode: s.state_code,
        terminal: s.terminal,
        hasActiveRoutes: s.has_active_routes,
      }));

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ timestamp: Date.now(), states, source: 'TransitHub Synced API' })
        );
      } catch {
        // ignore
      }

      return { states, source: 'TransitHub Synced Country Service' };
    }
  } catch {
    // Continue to static fallback
  }

  // 3. Fallback to bundled complete 37 states list
  const fallbackStates: NigeriaState[] = FALLBACK_NIGERIA_STATES.map(s => ({
    name: s.name,
    fullName: s.fullName,
    stateCode: s.stateCode,
    terminal: s.terminal,
    hasActiveRoutes: ACTIVE_HUB_CITIES.includes(s.name),
  }));

  return { states: fallbackStates, source: 'Verified Regional Baseline' };
}

