import { useRef, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import citySkyline from "@/assets/city-skyline.jpg";

/* ─── Twinkling city lights ─── */
function TwinklingLights({ count = 40 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const phases = useMemo(() => Array.from({ length: count }, () => Math.random() * Math.PI * 2), [count]);
  const speeds = useMemo(() => Array.from({ length: count }, () => 0.5 + Math.random() * 2), [count]);

  const positions = useMemo(() => {
    return Array.from({ length: count }, () => [
      (Math.random() - 0.5) * 1.8,
      -0.3 + Math.random() * 0.7,
      0,
    ] as [number, number, number]);
  }, [count]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      dummy.position.set(...positions[i]);
      const s = 0.004 + 0.003 * (0.5 + 0.5 * Math.sin(t * speeds[i] + phases[i]));
      dummy.scale.set(s * 20, s * 20, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#FDE68A" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

/* ─── Window with city skyline ─── */
export function Window() {
  const texture = useLoader(THREE.TextureLoader, citySkyline);
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <group position={[-4.9, 2.2, -1.5]} rotation={[0, Math.PI / 2, 0]}>
      {/* Frame */}
      <RoundedBox args={[2.2, 1.6, 0.12]} radius={0.04}>
        <meshStandardMaterial color="#2A3548" roughness={0.4} metalness={0.35} />
      </RoundedBox>

      {/* City skyline backdrop */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.0, 1.4]} />
        <meshBasicMaterial map={texture} />
      </mesh>

      {/* Twinkling lights layer */}
      <group position={[0, 0, 0.01]}>
        <TwinklingLights count={50} />
      </group>

      {/* Glass overlay for reflection effect */}
      <mesh position={[0, 0, 0.065]}>
        <planeGeometry args={[2.0, 1.4]} />
        <meshStandardMaterial
          color="#1a2540"
          transparent
          opacity={0.15}
          roughness={0.05}
          metalness={0.7}
        />
      </mesh>

      {/* Window divider vertical */}
      <mesh position={[0, 0, 0.07]}>
        <boxGeometry args={[0.03, 1.45, 0.02]} />
        <meshStandardMaterial color="#2A3548" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Window divider horizontal */}
      <mesh position={[0, 0.1, 0.07]}>
        <boxGeometry args={[2.05, 0.03, 0.02]} />
        <meshStandardMaterial color="#2A3548" roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Window sill */}
      <RoundedBox args={[2.3, 0.06, 0.2]} position={[0, -0.85, 0.1]} radius={0.015}>
        <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.3} />
      </RoundedBox>
    </group>
  );
}

/* ─── Rug with pattern ─── */
export function Rug() {
  return (
    <group>
      {/* Outer rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.5]}>
        <circleGeometry args={[2.5, 64]} />
        <meshStandardMaterial color="#2A1F14" roughness={1} />
      </mesh>
      {/* Inner ring pattern */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.5]}>
        <ringGeometry args={[1.5, 1.7, 64]} />
        <meshStandardMaterial color="#3D2B1F" roughness={0.95} />
      </mesh>
      {/* Center */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0.5]}>
        <circleGeometry args={[0.8, 64]} />
        <meshStandardMaterial color="#332211" roughness={0.95} />
      </mesh>
    </group>
  );
}

/* ─── Plant ─── */
export function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.18, 0.13, 0.36, 16]} />
        <meshStandardMaterial color="#78350F" roughness={0.85} />
      </mesh>
      {/* Pot rim */}
      <mesh position={[0, 0.37, 0]}>
        <torusGeometry args={[0.18, 0.02, 8, 16]} />
        <meshStandardMaterial color="#92400E" roughness={0.7} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.16, 16]} />
        <meshStandardMaterial color="#3D2410" roughness={1} />
      </mesh>
      {/* Trunk */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.35, 8]} />
        <meshStandardMaterial color="#5C4033" roughness={0.9} />
      </mesh>
      {/* Leaves - lush clusters */}
      {[
        [0, 0.8, 0, 0.14],
        [0.08, 0.72, 0.06, 0.1],
        [-0.06, 0.75, -0.08, 0.11],
        [0.05, 0.85, -0.04, 0.09],
        [-0.07, 0.82, 0.05, 0.1],
        [0, 0.9, 0, 0.08],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 10, 8]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#166534" : "#15803D"}
            roughness={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ─── Side Table ─── */
export function SideTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[0.5, 0.04, 0.5]} position={[0, 0.45, 0]} radius={0.01}>
        <meshStandardMaterial color="#4A3328" roughness={0.55} />
      </RoundedBox>
      {[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]}>
          <cylinderGeometry args={[0.015, 0.015, 0.44, 8]} />
          <meshStandardMaterial color="#4B5563" metalness={0.7} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}
