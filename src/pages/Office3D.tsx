import { Suspense, useState, useCallback, useRef, lazy } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text, RoundedBox, Float } from "@react-three/drei";
import { useNavigate } from "react-router-dom";
import { useAgent } from "@/contexts/AgentContext";
import * as THREE from "three";

/* ─── Types ─── */
interface OfficeObject {
  id: string;
  label: string;
  sublabel: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  emissive: string;
  route: string;
  icon: string;
}

const OBJECTS: OfficeObject[] = [
  {
    id: "desk",
    label: "Chat",
    sublabel: "Talk to your agent",
    position: [0, 0.5, 0],
    size: [2.4, 0.15, 1.2],
    color: "#5C4033",
    emissive: "#E8960D",
    route: "/decision/text",
    icon: "💻",
  },
  {
    id: "inbox",
    label: "Inbox Tray",
    sublabel: "Approvals & drafts",
    position: [-3.2, 0.7, -1],
    size: [1, 0.8, 0.7],
    color: "#D97706",
    emissive: "#F59E0B",
    route: "/dashboard",
    icon: "📥",
  },
  {
    id: "tasks",
    label: "Task Board",
    sublabel: "Action items",
    position: [-3.5, 1.8, -3.8],
    size: [2, 1.4, 0.1],
    color: "#059669",
    emissive: "#10B981",
    route: "/dashboard",
    icon: "📋",
  },
  {
    id: "calendar",
    label: "Calendar",
    sublabel: "Schedule & meetings",
    position: [0, 1.8, -3.8],
    size: [1.6, 1.4, 0.1],
    color: "#2563EB",
    emissive: "#3B82F6",
    route: "/calendar",
    icon: "📅",
  },
  {
    id: "mail",
    label: "Mail Station",
    sublabel: "Email triage",
    position: [3.2, 0.7, -1],
    size: [0.8, 1, 0.6],
    color: "#E11D48",
    emissive: "#F43F5E",
    route: "/email",
    icon: "✉️",
  },
  {
    id: "settings",
    label: "Settings",
    sublabel: "Preferences",
    position: [3.5, 1.8, -3.8],
    size: [1.2, 1.4, 0.1],
    color: "#6B7280",
    emissive: "#9CA3AF",
    route: "/settings",
    icon: "⚙️",
  },
  {
    id: "eod",
    label: "EOD Wrap-Up",
    sublabel: "Summarize your day",
    position: [3.5, 0.4, 2],
    size: [1, 0.6, 0.6],
    color: "#7C3AED",
    emissive: "#8B5CF6",
    route: "/eod-wrapup",
    icon: "🌙",
  },
  {
    id: "sms",
    label: "SMS Log",
    sublabel: "Text history",
    position: [-3.2, 0.4, 2],
    size: [0.7, 0.5, 0.5],
    color: "#0D9488",
    emissive: "#14B8A6",
    route: "/sms-log",
    icon: "📱",
  },
];

/* ─── Clickable Office Object ─── */
function ClickableObject({
  obj,
  onNavigate,
  hovered,
  onHover,
  onUnhover,
}: {
  obj: OfficeObject;
  onNavigate: (route: string) => void;
  hovered: boolean;
  onHover: () => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const targetScale = hovered ? 1.08 : 1;
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.1
    );
  });

  return (
    <group position={obj.position}>
      <RoundedBox
        ref={meshRef}
        args={obj.size}
        radius={0.08}
        smoothness={4}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onNavigate(obj.route);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onUnhover();
          document.body.style.cursor = "auto";
        }}
      >
        <meshStandardMaterial
          color={obj.color}
          emissive={hovered ? obj.emissive : "#000000"}
          emissiveIntensity={hovered ? 0.4 : 0}
          roughness={0.6}
          metalness={0.1}
        />
      </RoundedBox>

      {/* Label floating above */}
      <Float speed={2} floatIntensity={0.3} rotationIntensity={0}>
        <Text
          position={[0, obj.size[1] / 2 + 0.5, 0]}
          fontSize={0.22}
          color={hovered ? "#E8960D" : "#F5F0E8"}
          anchorX="center"
          anchorY="middle"
          font="/fonts/Inter-Bold.woff"
          outlineWidth={0.02}
          outlineColor="#141A26"
        >
          {`${obj.icon} ${obj.label}`}
        </Text>
        {hovered && (
          <Text
            position={[0, obj.size[1] / 2 + 0.25, 0]}
            fontSize={0.14}
            color="#8B94A6"
            anchorX="center"
            anchorY="middle"
          >
            {obj.sublabel}
          </Text>
        )}
      </Float>
    </group>
  );
}

/* ─── Room geometry ─── */
function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#1C2333" roughness={0.8} metalness={0.05} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 2.5, -4]} receiveShadow>
        <planeGeometry args={[12, 5]} />
        <meshStandardMaterial color="#232D3F" roughness={0.9} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-5, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[12, 5]} />
        <meshStandardMaterial color="#1F2937" roughness={0.9} />
      </mesh>

      {/* Right wall */}
      <mesh position={[5, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[12, 5]} />
        <meshStandardMaterial color="#1F2937" roughness={0.9} />
      </mesh>

      {/* Baseboard trim - back */}
      <mesh position={[0, 0.08, -3.95]}>
        <boxGeometry args={[12, 0.16, 0.1]} />
        <meshStandardMaterial color="#2A3548" roughness={0.5} />
      </mesh>

      {/* Baseboard trim - left */}
      <mesh position={[-4.95, 0.08, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[12, 0.16, 0.1]} />
        <meshStandardMaterial color="#2A3548" roughness={0.5} />
      </mesh>

      {/* Baseboard trim - right */}
      <mesh position={[4.95, 0.08, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[12, 0.16, 0.1]} />
        <meshStandardMaterial color="#2A3548" roughness={0.5} />
      </mesh>

      {/* Ceiling light strip */}
      <mesh position={[0, 4.9, 0]}>
        <boxGeometry args={[6, 0.05, 0.3]} />
        <meshStandardMaterial
          color="#E8960D"
          emissive="#E8960D"
          emissiveIntensity={2}
        />
      </mesh>
    </group>
  );
}

/* ─── Desk details ─── */
function DeskSetup() {
  return (
    <group>
      {/* Desk legs */}
      {[
        [-1, 0.21, -0.45],
        [1, 0.21, -0.45],
        [-1, 0.21, 0.45],
        [1, 0.21, 0.45],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <cylinderGeometry args={[0.04, 0.04, 0.42, 8]} />
          <meshStandardMaterial color="#3D2B1F" roughness={0.7} />
        </mesh>
      ))}

      {/* Monitor */}
      <RoundedBox args={[0.9, 0.6, 0.04]} position={[0, 1.1, -0.2]} radius={0.02}>
        <meshStandardMaterial
          color="#0F172A"
          emissive="#1E40AF"
          emissiveIntensity={0.15}
          roughness={0.3}
          metalness={0.5}
        />
      </RoundedBox>

      {/* Monitor stand */}
      <mesh position={[0, 0.75, -0.2]}>
        <cylinderGeometry args={[0.03, 0.05, 0.35, 8]} />
        <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Chair */}
      <group position={[0, 0.35, 1.2]}>
        <RoundedBox args={[0.6, 0.08, 0.6]} radius={0.03}>
          <meshStandardMaterial color="#1F2937" roughness={0.8} />
        </RoundedBox>
        <RoundedBox args={[0.55, 0.7, 0.06]} position={[0, 0.38, -0.27]} radius={0.03}>
          <meshStandardMaterial color="#1F2937" roughness={0.8} />
        </RoundedBox>
        {/* Chair base */}
        <mesh position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.25, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

/* ─── Window with glow ─── */
function Window() {
  return (
    <group position={[-4.9, 2.2, -1.5]} rotation={[0, Math.PI / 2, 0]}>
      {/* Frame */}
      <RoundedBox args={[2, 1.5, 0.1]} radius={0.04}>
        <meshStandardMaterial color="#2A3548" roughness={0.5} metalness={0.3} />
      </RoundedBox>
      {/* Glass */}
      <mesh position={[0, 0, 0.06]}>
        <planeGeometry args={[1.8, 1.3]} />
        <meshStandardMaterial
          color="#1a2540"
          emissive="#334155"
          emissiveIntensity={0.3}
          transparent
          opacity={0.7}
          roughness={0.1}
          metalness={0.5}
        />
      </mesh>
    </group>
  );
}

/* ─── Rug ─── */
function Rug() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.5]}>
      <circleGeometry args={[2.5, 64]} />
      <meshStandardMaterial color="#2A1F14" roughness={1} />
    </mesh>
  );
}

/* ─── Plant ─── */
function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.2, 0.15, 0.4, 12]} />
        <meshStandardMaterial color="#78350F" roughness={0.9} />
      </mesh>
      {/* Leaves */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <mesh
          key={i}
          position={[
            Math.cos((angle * Math.PI) / 180) * 0.15,
            0.55 + i * 0.04,
            Math.sin((angle * Math.PI) / 180) * 0.15,
          ]}
          rotation={[0.3, (angle * Math.PI) / 180, 0.4]}
        >
          <sphereGeometry args={[0.12, 8, 6]} />
          <meshStandardMaterial color="#166534" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/* ─── Scene ─── */
function OfficeScene({ onNavigate }: { onNavigate: (route: string) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 4.5, 0]} intensity={1.5} color="#E8960D" />
      <pointLight position={[-3, 3, 2]} intensity={0.5} color="#60A5FA" />
      <pointLight position={[3, 3, -2]} intensity={0.4} color="#F0AD3E" />
      <directionalLight position={[5, 5, 5]} intensity={0.3} />

      {/* Room */}
      <Room />
      <DeskSetup />
      <Window />
      <Rug />
      <Plant position={[-4, 0, 3]} />
      <Plant position={[4.2, 0, -3]} />


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

      {/* Camera controls */}
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

/* ─── Main Page ─── */
export default function Office3D() {
  const navigate = useNavigate();
  const { agentName } = useAgent();

  const handleNavigate = useCallback(
    (route: string) => navigate(route),
    [navigate]
  );

  return (
    <div className="h-screen w-screen bg-[#141A26] relative overflow-hidden">
      {/* 3D Canvas */}
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

      {/* Bottom hint */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="px-4 py-2 rounded-full bg-card/60 backdrop-blur border border-border/20 text-xs text-muted-foreground/60">
          Scroll to zoom · Click objects to navigate
        </div>
      </div>
    </div>
  );
}
