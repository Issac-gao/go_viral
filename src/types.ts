export const FORMS = ['worker', 'puffer', 'rest', 'offwork'] as const;
export type Form = typeof FORMS[number];
export type Action = 'work' | 'vent' | 'rest' | 'offwork' | 'poke' | 'water' | 'stretch';
export type ReminderKind = 'water' | 'rest' | 'offwork';
export interface Settings {
  version: 1;
  form: Form;
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
  position: { x: number; y: number } | null;
  reminders: {
    water: { enabled: boolean; minutes: number };
    rest: { enabled: boolean; minutes: number };
    offwork: { enabled: boolean; at: string };
    start: string; end: string; days: number[];
  };
}
export interface PetState {
  settings: Settings;
  paused: boolean;
  action: Action | null;
  remainingMs: number;
  reminder: ReminderKind[] | null;
}
export interface PigBridge {
  getState(): Promise<PetState>;
  setForm(form: Form): Promise<void>;
  act(action: Action): Promise<void>;
  configure(): Promise<void>;
  saveSettings(settings: Settings): Promise<Settings>;
  hide(): Promise<void>;
  menu(): Promise<void>;
  quit(): Promise<void>;
  closeSettings(): Promise<void>;
  dragStart(): Promise<void>;
  dragEnd(): Promise<void>;
  onState(callback: (state: PetState) => void): () => void;
}
declare global { interface Window { pig: PigBridge; } }
