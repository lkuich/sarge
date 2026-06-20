import {
  Shader,
  Pixelate,
  Plasma,
  SineWave,
  SolidColor,
} from "shaders/react";
import { SHADER_PALETTES } from "@/lib/theme";
import { useTheme } from "@/hooks/useTheme";

export default function ShaderEffect() {
  const { theme } = useTheme();
  const palette = SHADER_PALETTES[theme];

  return (
    <Shader>
      <SolidColor color={palette.base} />
      <Pixelate
        gap={{
          type: "map",
          curve: 0.35,
          source: "idmmbhthud5inxgebqc",
          channel: "alphaInverted",
          inputMax: 1,
          inputMin: 0,
          outputMax: 1,
          outputMin: 0.16,
        }}
        roundness={0.2}
        scale={74}
      >
        <Plasma
          balance={57}
          colorA={palette.colorA}
          colorB={palette.colorB}
          contrast={1.6}
          density={3.3}
          intensity={1.8}
        />
      </Pixelate>
      <SineWave
        id="idmmbhthud5inxgebqc"
        amplitude={0.1}
        angle={159}
        frequency={0.7}
        position={{ x: 0.3, y: 0.62 }}
        softness={1}
        thickness={1}
        visible={false}
      />
    </Shader>
  );
}
