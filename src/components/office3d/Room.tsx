import { RoundedBox } from "@react-three/drei";

export function Room() {
  return (
    <group>
      {/* Floor - wood plank effect with warm tone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#2A1F14" roughness={0.75} metalness={0.05} />
      </mesh>

      {/* Floor border inlay */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[4.8, 5.2, 4]} />
        <meshStandardMaterial color="#3D2B1F" roughness={0.6} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 2.5, -4]}>
        <planeGeometry args={[12, 5]} />
        <meshStandardMaterial color="#1E2738" roughness={0.92} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-5, 2.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[12, 5]} />
        <meshStandardMaterial color="#1A2332" roughness={0.92} />
      </mesh>

      {/* Right wall */}
      <mesh position={[5, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[12, 5]} />
        <meshStandardMaterial color="#1A2332" roughness={0.92} />
      </mesh>

      {/* Crown molding - back */}
      <RoundedBox args={[12, 0.12, 0.12]} position={[0, 4.94, -3.94]} radius={0.03}>
        <meshStandardMaterial color="#3A4558" roughness={0.4} metalness={0.2} />
      </RoundedBox>

      {/* Crown molding - left */}
      <RoundedBox args={[0.12, 0.12, 12]} position={[-4.94, 4.94, 0]} radius={0.03}>
        <meshStandardMaterial color="#3A4558" roughness={0.4} metalness={0.2} />
      </RoundedBox>

      {/* Crown molding - right */}
      <RoundedBox args={[0.12, 0.12, 12]} position={[4.94, 4.94, 0]} radius={0.03}>
        <meshStandardMaterial color="#3A4558" roughness={0.4} metalness={0.2} />
      </RoundedBox>

      {/* Baseboard trim - back */}
      <mesh position={[0, 0.1, -3.95]}>
        <boxGeometry args={[12, 0.2, 0.1]} />
        <meshStandardMaterial color="#2A3548" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Baseboard trim - left */}
      <mesh position={[-4.95, 0.1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[12, 0.2, 0.1]} />
        <meshStandardMaterial color="#2A3548" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Baseboard trim - right */}
      <mesh position={[4.95, 0.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[12, 0.2, 0.1]} />
        <meshStandardMaterial color="#2A3548" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#1C2333" roughness={0.95} />
      </mesh>

      {/* Ceiling light strip - warm amber */}
      <mesh position={[0, 4.88, 0]}>
        <boxGeometry args={[5, 0.04, 0.25]} />
        <meshStandardMaterial color="#E8960D" emissive="#E8960D" emissiveIntensity={3} />
      </mesh>

      {/* Secondary ceiling light strip */}
      <mesh position={[0, 4.88, -2]}>
        <boxGeometry args={[3, 0.04, 0.15]} />
        <meshStandardMaterial color="#F0AD3E" emissive="#F0AD3E" emissiveIntensity={1.5} />
      </mesh>

      {/* Wall art frame - back wall left */}
      <group position={[-2.5, 2.8, -3.92]}>
        <RoundedBox args={[1.2, 0.8, 0.06]} radius={0.02}>
          <meshStandardMaterial color="#1A1A2E" roughness={0.3} metalness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={[1.0, 0.6]} />
          <meshStandardMaterial color="#2D1B4E" emissive="#4C1D95" emissiveIntensity={0.15} roughness={0.8} />
        </mesh>
      </group>

      {/* Wall art frame - back wall right */}
      <group position={[2.5, 2.8, -3.92]}>
        <RoundedBox args={[0.8, 1.0, 0.06]} radius={0.02}>
          <meshStandardMaterial color="#1A1A2E" roughness={0.3} metalness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={[0.6, 0.8]} />
          <meshStandardMaterial color="#1B3A4E" emissive="#1E40AF" emissiveIntensity={0.15} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}
