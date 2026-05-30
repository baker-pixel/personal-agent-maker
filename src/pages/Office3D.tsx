import { Suspense, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useNavigate } from "react-router-dom";
import { useAgent } from "@/contexts/AgentContext";

import { Room } from "@/components/office3d/Room";
import { DeskSetup, Bookshelf, FloorLamp } from "@/components/office3d/Furniture";
import { Window, Rug, Plant, SideTable } from "@/components/office3d/Decorations";
import { ClickableObject } from "@/components/office3d/ClickableObject";
import { OBJECTS } from "@/components/office3d/constants";

function OfficeScene({ onNavigate }: { onNavigate: (route: string) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      {/* Ambient fill */}
      <ambientLight intensity={0.3} color="#C4B5A0" />

      {/* Warm overhead key light */}
      <pointLight position={[0, 4.5, 0]} intensity={1.8} color="#E8960D" distance={12} decay={1.5} />

      {/* Cool fill from left window */}
      <pointLight position={[-4, 3, -1.5]} intensity={0.7} color="#60A5FA" distance={8} decay={2} />

      {/* Warm accent from right */}
      <pointLight position={[3, 2, 2]} intensity={0.4} color="#F0AD3E" distance={6} decay={2} />

      {/* Subtle backlight for depth */}
      <directionalLight position={[2, 5, -5]} intensity={0.25} color="#E2E8F0" />

      {/* Rim light from behind */}
      <pointLight position={[0, 3, -3.5]} intensity={0.3} color="#818CF8" distance={6} decay={2} />

      <Room />
      <DeskSetup />
      <Window />
      <Rug />

      {/* Plants */}
      <Plant position={[-4, 0, 3]} />
      <Plant position={[4.2, 0, -3]} />
      <Plant position={[-4.2, 0, -3]} />

      {/* Bookshelf on right wall */}
      <Bookshelf position={[4.3, 1.1, 1]} />

      {/* Floor lamps */}
      <FloorLamp position={[-4, 0, 0.5]} color="#F59E0B" />
      <FloorLamp position={[4, 0, -1.5]} color="#60A5FA" />

      {/* Side tables */}
      <SideTable position={[-3.5, 0, 3]} />
      <SideTable position={[3.5, 0, 3.2]} />

      {/* Clickable objects */}
      {OBJECTS.map((obj) => (
        <ClickableObject
          key={obj.id}
          obj={obj}
          onNavigate={onNavigate}
          hovered={hoveredId === obj.id}
          onHover={() => setHoveredId(obj.id)}
          onUnhover={() => setHoveredId(null)}
        />
      ))}

      <OrbitControls
        makeDefault
        minPolarAngle={Math.PI * 0.2}
        maxPolarAngle={Math.PI * 0.48}
        minDistance={5}
        maxDistance={12}
        target={[0, 1.2, 0]}
        enablePan={false}
      />
    </>
  );
}

export default function Office3D() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const handleNavigate = useCallback((route: string) => navigate(route), [navigate]);

  return (
    <div className="h-screen w-screen bg-[#141A26] relative overflow-hidden pt-[var(--header-h)]">
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">Loading office...</p>
            </div>
          </div>
        }
      >
        <Canvas
          camera={{ position: [0, 4, 8], fov: 50 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          style={{ background: "#141A26" }}
          frameloop="always"
        >
          <OfficeScene onNavigate={handleNavigate} />
        </Canvas>
      </Suspense>

      {/* HUD overlay */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none p-5 flex items-start justify-between">
        <div className="pointer-events-auto">
          <button
            onClick={() => navigate("/office")}
            className="px-4 py-2 rounded-xl bg-card/80 backdrop-blur border border-border/30 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to 2D Office
          </button>
        </div>
        <div className="text-right">
          <h1 className="font-display text-xl font-bold text-foreground/90 drop-shadow-lg">
            {agentName}'s Office
          </h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Click any object · Drag to look around
          </p>
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="px-4 py-2 rounded-full bg-card/60 backdrop-blur border border-border/20 text-xs text-muted-foreground/60">
          Scroll to zoom · Click objects to navigate
        </div>
      </div>
    </div>
  );
}
