import React from 'react';
import {Composition, Folder} from 'remotion';
import {DemoFilm90, LaunchFilm60, SocialCut30, VerticalCut15} from './compositions';
import {
  PREMIUM_DEMO_DURATION,
  PREMIUM_LAUNCH_DURATION,
  PREMIUM_SOCIAL_DURATION,
  PREMIUM_VERTICAL_DURATION,
  PremiumDemo90,
  PremiumLaunch60,
  PremiumSocial30,
  PremiumVertical15,
} from './v2/compositions';

const FPS = 30;

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="SahelFlow-Premium-V2">
      <Composition
        id="SahelFlow-Premium-Launch-60"
        component={PremiumLaunch60}
        durationInFrames={PREMIUM_LAUNCH_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="SahelFlow-Premium-Social-30"
        component={PremiumSocial30}
        durationInFrames={PREMIUM_SOCIAL_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="SahelFlow-Premium-Vertical-15"
        component={PremiumVertical15}
        durationInFrames={PREMIUM_VERTICAL_DURATION}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="SahelFlow-Premium-Demo-90"
        component={PremiumDemo90}
        durationInFrames={PREMIUM_DEMO_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </Folder>
    <Folder name="SahelFlow-Legacy-V1">
      <Composition
        id="SahelFlow-Launch-60"
        component={LaunchFilm60}
        durationInFrames={60 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="SahelFlow-Social-30"
        component={SocialCut30}
        durationInFrames={30 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="SahelFlow-Vertical-15"
        component={VerticalCut15}
        durationInFrames={15 * FPS}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="SahelFlow-Demo-90"
        component={DemoFilm90}
        durationInFrames={90 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </Folder>
  </>
);
