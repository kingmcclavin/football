import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Career } from './league/career';
import { loadSettings, saveSettings, type Settings } from './save/settings';
import { saveCareer } from './save/storage';
import { configureAudio, startMusic, stopMusic, unlockAudio } from './audio/sfx';
import { Ctx, type AppCtx, type Route, type ScreenName } from './ui/common';
import { TitleScreen, SlotsScreen } from './ui/TitleScreen';
import { NewCareer } from './ui/NewCareer';
import { Hub } from './ui/Hub';
import { RosterScreen, DepthScreen, TeamScreen } from './ui/Roster';
import { LeagueScreen } from './ui/League';
import { ScheduleScreen, BoxScoreScreen } from './ui/Schedule';
import { StatsScreen, RecordsScreen, AchievementsScreen } from './ui/Stats';
import { OfficeScreen } from './ui/FrontOffice';
import { TradesScreen } from './ui/Trades';
import { FreeAgentsScreen } from './ui/FreeAgents';
import { OffseasonScreen } from './ui/Offseason';
import { PreGame, PostGame } from './ui/PreGame';
import { GameScreen } from './ui/GameScreen';
import { SettingsScreen } from './ui/Settings';
import { HelpScreen } from './ui/Help';

export default function App() {
  const [stack, setStack] = useState<Route[]>([{ name: 'title' }]);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const careerRef = useRef<Career | null>(null);
  const [version, setVersion] = useState(0);
  const [toastMsg, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const toast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const setCareer = useCallback((c: Career | null) => {
    careerRef.current = c;
    setVersion((v) => v + 1);
  }, []);
  const persist = useCallback(
    async (quiet = true) => {
      const c = careerRef.current;
      if (!c) return;
      try {
        await saveCareer(c);
        if (!quiet) toast('Career saved');
      } catch (e) {
        toast(`Save failed: ${(e as Error).message}. Export your career from Settings to keep a copy.`);
      }
    },
    [toast],
  );
  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
    configureAudio(s);
  }, []);

  useEffect(() => {
    configureAudio(settings);
    const unlock = () => {
      unlockAudio();
      if (loadSettings().music) startMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const route = stack[stack.length - 1];
  // menu music only outside the game
  useEffect(() => {
    if (route.name === 'game') stopMusic();
    else if (settings.music) startMusic();
  }, [route.name, settings.music]);

  const ctx: AppCtx = useMemo(
    () => ({
      career: careerRef.current,
      setCareer,
      refresh,
      persist,
      settings,
      setSettings,
      version,
      toast,
      go: (name: ScreenName, params?: Record<string, unknown>) => setStack((s) => [...s, { name, params }]),
      replace: (name: ScreenName, params?: Record<string, unknown>) => setStack((s) => [...s.slice(0, -1), { name, params }]),
      back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      reset: (r: Route) => setStack([r]),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, settings, setCareer, refresh, persist, setSettings, toast],
  );

  const p = route.params ?? {};
  let screen: JSX.Element;
  switch (route.name) {
    case 'title':
      screen = <TitleScreen />;
      break;
    case 'slots':
      screen = <SlotsScreen mode={(p.mode as 'load' | 'new') ?? 'load'} />;
      break;
    case 'new':
      screen = <NewCareer slot={(p.slot as number) ?? 0} />;
      break;
    case 'hub':
      screen = <Hub welcome={!!p.welcome} />;
      break;
    case 'roster':
      screen = <RosterScreen />;
      break;
    case 'depth':
      screen = <DepthScreen />;
      break;
    case 'team':
      screen = <TeamScreen teamId={p.teamId as number} />;
      break;
    case 'league':
      screen = <LeagueScreen tab={p.tab as string | undefined} />;
      break;
    case 'schedule':
      screen = <ScheduleScreen />;
      break;
    case 'box':
      screen = <BoxScoreScreen gameId={p.gameId as number} />;
      break;
    case 'stats':
      screen = <StatsScreen />;
      break;
    case 'records':
      screen = <RecordsScreen />;
      break;
    case 'achievements':
      screen = <AchievementsScreen />;
      break;
    case 'office':
      screen = <OfficeScreen tab={p.tab as string | undefined} />;
      break;
    case 'trades':
      screen = <TradesScreen partner={p.partner as number | undefined} />;
      break;
    case 'freeagents':
      screen = <FreeAgentsScreen />;
      break;
    case 'offseason':
      screen = <OffseasonScreen />;
      break;
    case 'pregame':
      screen = <PreGame />;
      break;
    case 'game':
      screen = <GameScreen resume={!!p.resume} />;
      break;
    case 'postgame':
      screen = <PostGame gameId={p.gameId as number} />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    case 'help':
      screen = <HelpScreen />;
      break;
    default:
      screen = <TitleScreen />;
  }
  return (
    <Ctx.Provider value={ctx}>
      <div className="app">{screen}</div>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
