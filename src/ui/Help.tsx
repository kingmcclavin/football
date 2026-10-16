import { useState, type ReactNode } from 'react';
import { Panel, Tabs, TopBar } from './common';
import { Paged } from './paged';

type T = 'basics' | 'offense' | 'defense' | 'kicking' | 'rules' | 'manage' | 'controls';

const CONTENT: Record<T, ReactNode[]> = {
  basics: [
    <p key={0} style={{ margin: '0 0 6px' }}>You are the head coach and general manager of a pro football franchise. Each week you play a full game: you control the offense, call the defense, and handle kicks. Between games you manage the roster, contracts, staff, facilities and finances.</p>,
    <p key={1} style={{ margin: '0 0 6px' }}>Win games to earn coaching credits (CC), grow fan support and keep your job. The owner sets a win target before every season based on how good your roster is. Beat it and your job security and reputation rise; miss badly and you may be fired.</p>,
    <p key={2} style={{ margin: '0 0 6px' }}>A season is 16 games. Seven teams per conference make the playoffs, ending in the Gridiron Bowl. After the playoffs comes the offseason: awards, aging, contract decisions, the draft and free agency.</p>,
    <p key={3} style={{ margin: '0 0 6px' }} className="gold">Tip: play in landscape on a phone for the widest view of the field.</p>,
  ],
  offense: [
    <p key={0} style={{ margin: '0 0 6px' }}>Before each snap, pick a play. Each card shows the formation and routes; yellow lines are wide receivers, orange is the tight end, light blue is a running back, and solid orange is the ball carrier's path on runs. The dots show risk: short passes are safe, deep shots and blitz-beaters are risky.</p>,
    <p key={1} style={{ margin: '0 0 6px' }}>On 4th down you can punt or kick a field goal. Use Spike to stop the clock and Kneel to run it out with a lead.</p>,
    <p key={2} style={{ margin: '0 0 6px' }}>After the snap your quarterback drops back and the receivers run their routes. Drag on the field to aim: by default you pull back like a slingshot, away from where you want the ball to go. A dotted arc and target ring show the throw. Release to throw.</p>,
    <p key={3} style={{ margin: '0 0 6px' }}>Lead your receivers: the ball takes time to arrive, so aim where they will be, not where they are. The ring grows with distance and pressure. Throws into tight coverage get broken up or intercepted. Your QB's arm strength limits distance and his accuracy sets how close the ball lands to your target.</p>,
    <p key={4} style={{ margin: '0 0 6px' }}>Under pressure? Press RUN to tuck the ball and scramble. You cannot throw once you cross the line of scrimmage.</p>,
    <p key={5} style={{ margin: '0 0 6px' }}>On run plays the ball is handed off automatically. Then you control the runner: drag anywhere to steer (a joystick appears where your finger lands). The runner keeps moving forward on his own if you let go.</p>,
    <p key={6} style={{ margin: '0 0 6px' }}>JUKE makes a quick cut that can make a tackler miss, timed just before contact. BURST is a sprint that drains the stamina bar under your runner. DIVE ends the play falling forward for an extra yard (quarterbacks SLIDE to avoid hits). Follow your blockers and look for cutback lanes.</p>,
  ],
  defense: [
    <p key={0} style={{ margin: '0 0 6px' }}>When the opponent has the ball, you pick a defensive call before each snap (or let your coordinator call it automatically in Settings). The play then runs on the field with every player using his real ratings.</p>,
    <p key={1} style={{ margin: '0 0 6px' }}>Zone coverage (Cover 2, Cover 3, Prevent) limits big plays. Man coverage (Cover 1, 2-Man) is tight but can be beaten by fast receivers. Blitzes bring pressure for sacks but leave holes behind. Run Stuff and Goal Line load the box against the run.</p>,
    <p key={2} style={{ margin: '0 0 6px' }}>Think like a coordinator: expect passes on 3rd and long, runs on 3rd and 1, and deep shots when the opponent is behind late. You can watch drives at normal speed, fast, or results only.</p>,
  ],
  kicking: [
    <p key={0} style={{ margin: '0 0 6px' }}>Field goals, extra points, punts and kickoffs use a two-tap meter. First tap locks the aim as the marker sweeps left and right; stop it in the green zone. Second tap sets power as the bar fills. For field goals the white tick shows the power needed to reach the posts.</p>,
    <p key={1} style={{ margin: '0 0 6px' }}>Wind pushes kicks sideways (shown in the scoreboard). Longer kicks have a faster aim sweep. For punts and kickoffs, aim steers the ball toward a sideline.</p>,
    <p key={2} style={{ margin: '0 0 6px' }}>When receiving, your returner catches the ball automatically, then you steer. Call FAIR CATCH on punts if coverage is close, or TAKE A KNEE in the end zone for a touchback.</p>,
  ],
  rules: [
    <p key={0} style={{ margin: '0 0 6px' }}>Four quarters (length set in Settings). You have four downs to gain ten yards. Touchdowns are worth 6, then kick for 1 or go for 2 from the 2-yard line. Field goals are 3, safeties 2.</p>,
    <p key={1} style={{ margin: '0 0 6px' }}>The clock runs between plays after runs and completions in bounds. It stops on incompletions, scores, turnovers, timeouts, and when the ball goes out of bounds late in each half. A two-minute warning stops the clock in each half. Each team has three timeouts per half.</p>,
    <p key={2} style={{ margin: '0 0 6px' }}>Overtime: both teams get a possession unless the first scores a defensive touchdown; after that the next score wins. Regular-season games can end in a tie after one overtime period; playoff games continue until there is a winner.</p>,
    <p key={3} style={{ margin: '0 0 6px' }}>Kickoff touchbacks come out to the 30; punt touchbacks to the 20.</p>,
  ],
  manage: [
    <p key={0} style={{ margin: '0 0 6px' }}><b className="gold">Roster:</b> up to 40 players. Every player has ratings that drive the game: speed creates separation, blocking opens holes, coverage wins at the catch point. Set starters in the Depth Chart.</p>,
    <p key={1} style={{ margin: '0 0 6px' }}><b className="gold">Salary cap:</b> payroll must stay under $165M. Releasing a player leaves half his salary as dead money this season. Extend players in the final year of their deals before they hit the market.</p>,
    <p key={2} style={{ margin: '0 0 6px' }}><b className="gold">Development:</b> players under about 27 improve toward their potential; veterans past 30 decline. Weekly practice focus, coordinator quality and the training facility speed this up. Spend 2 CC on private coaching for a direct boost.</p>,
    <p key={3} style={{ margin: '0 0 6px' }}><b className="gold">Morale & condition:</b> morale rises with wins and playing time and helps in games and negotiations. Condition drops after games; tired players play worse and get hurt more. Rest weeks help.</p>,
    <p key={4} style={{ margin: '0 0 6px' }}><b className="gold">Draft:</b> three rounds; worst teams pick first. Scouting points reveal a prospect's true ratings. Rookies sign cheap multi-year deals.</p>,
    <p key={5} style={{ margin: '0 0 6px' }}><b className="gold">Free agency & trades:</b> sign unrestricted players if you have cap space and they are interested. Trades are open until week 10 and in the offseason; AI teams value youth, potential and premium positions.</p>,
    <p key={6} style={{ margin: '0 0 6px' }}><b className="gold">Front office:</b> hire coordinators (OC/DC boost development and in-game ratings for their unit, Strength & Medical reduces injuries), upgrade facilities with club cash, and respond to events between games. Every choice changes morale, fans, money or development.</p>,
  ],
  controls: [
    <h3 key={0}>Touch / mouse</h3>,
    <p key={1} style={{ margin: '0 0 6px' }}>Tap the field or SNAP to hike. Drag to aim and release to throw. Drag to steer the runner; a second finger also jukes. Buttons: RUN, JUKE, DIVE/SLIDE, BURST (hold), FAIR CATCH, TAKE A KNEE. Tap to kick (twice). II pauses.</p>,
    <h3 key={2}>Keyboard</h3>,
    <p key={3} style={{ margin: '0 0 6px' }}>
                <span className="kbd">Space</span>/<span className="kbd">Enter</span> snap, throw at the reticle, juke, kick, continue.{' '}
                <span className="kbd">Arrows</span> move the aiming reticle (or the runner).{' '}
                <span className="kbd">1</span>-<span className="kbd">6</span> jump the reticle to a receiver.{' '}
                <span className="kbd">WASD</span> move the QB or runner. <span className="kbd">Shift</span> burst. <span className="kbd">X</span> dive. <span className="kbd">E</span> tuck and run. <span className="kbd">F</span> fair catch. <span className="kbd">K</span> kneel. <span className="kbd">T</span> timeout. <span className="kbd">P</span>/<span className="kbd">Esc</span> pause.
              </p>,
  ],
};

export function HelpScreen() {
  const [t, setT] = useState<T>('basics');
  return (
    <div className="screen">
      <TopBar title="HELP & TUTORIAL" />
      <Tabs
        tabs={[
          { id: 'basics', label: 'Start' },
          { id: 'offense', label: 'Offense' },
          { id: 'defense', label: 'Defense' },
          { id: 'kicking', label: 'Kicking' },
          { id: 'rules', label: 'Rules' },
          { id: 'manage', label: 'Manage' },
          { id: 'controls', label: 'Controls' },
        ]}
        value={t}
        onChange={setT}
      />
      <Panel dark className="fill">
        <Paged resetKey={t} items={CONTENT[t]} className="small" />
      </Panel>
    </div>
  );
}
