import React from 'react';
import {Composition, Folder} from 'remotion';
import {DemoFilm90, LaunchFilm60, SocialCut30, VerticalCut15} from './compositions';

const FPS = 30;

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="SahelFlow-Launch">
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
    </Folder>
    <Folder name="SahelFlow-Product-Demo">
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
