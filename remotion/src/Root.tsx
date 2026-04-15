import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { AdminDemoVideo } from "./AdminDemoVideo";

export const RemotionRoot = () => (
  <>
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={850}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="admin-demo"
      component={AdminDemoVideo}
      durationInFrames={640}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
