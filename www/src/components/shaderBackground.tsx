import { Dither, Plasma, Shader, WaveDistortion } from "shaders/react";

export default function ShaderEffect() {
  return (
    <Shader style={{ width: "100%", height: "100%" }}>
      <Dither colorA="#0c0d14" colorB="#497ef7" pattern="bayer8" pixelSize={7} threshold={0.41}>
        <Plasma colorA="#ffffff" contrast={0.9} density={0.3} intensity={1.3} speed={1} />
        <WaveDistortion angle={138} edges="mirror" frequency={1.8} strength={1} visible waveType="square" />
      </Dither>
    </Shader>
  );
}
