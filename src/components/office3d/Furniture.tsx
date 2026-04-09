import { RoundedBox } from "@react-three/drei";

/* ─── Desk with drawers and accessories ─── */
export function DeskSetup() {
  return (
    <group>
      {/* Desk top - rich walnut */}
      <RoundedBox args={[2.4, 0.08, 1.2]} position={[0, 0.5, 0]} radius={0.02}>
        <meshStandardMaterial color="#5C4033" roughness={0.55} metalness={0.05} />
      </RoundedBox>

      {/* Desk edge trim */}
      <RoundedBox args={[2.44, 0.03, 1.24]} position={[0, 0.465, 0]} radius={0.01}>
        <meshStandardMaterial color="#4A3328" roughness={0.4} metalness={0.1} />
      </RoundedBox>

      {/* Desk legs - brushed metal */}
      {[
        [-1.05, 0.24, -0.5],
        [1.05, 0.24, -0.5],
        [-1.05, 0.24, 0.5],
        [1.05, 0.24, 0.5],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <boxGeometry args={[0.06, 0.48, 0.06]} />
          <meshStandardMaterial color="#4B5563" roughness={0.25} metalness={0.7} />
        </mesh>
      ))}

      {/* Desk crossbar */}
      <mesh position={[0, 0.08, -0.5]}>
        <boxGeometry args={[2.1, 0.04, 0.04]} />
        <meshStandardMaterial color="#4B5563" roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Drawer unit - right side */}
      <group position={[0.7, 0.28, 0]}>
        <RoundedBox args={[0.5, 0.38, 0.55]} radius={0.02}>
          <meshStandardMaterial color="#3D2B1F" roughness={0.6} />
        </RoundedBox>
        {/* Drawer handles */}
        {[-0.08, 0.08].map((y, i) => (
          <mesh key={i} position={[0.26, y, 0]}>
            <boxGeometry args={[0.02, 0.04, 0.12]} />
            <meshStandardMaterial color="#9CA3AF" roughness={0.2} metalness={0.8} />
          </mesh>
        ))}
      </group>

      {/* Monitor - widescreen with bezel */}
      <group position={[0, 1.12, -0.35]}>
        {/* Screen bezel */}
        <RoundedBox args={[1.1, 0.65, 0.04]} radius={0.015}>
          <meshStandardMaterial color="#111827" roughness={0.2} metalness={0.6} />
        </RoundedBox>
        {/* Screen display */}
        <mesh position={[0, 0.01, 0.025]}>
          <planeGeometry args={[1.0, 0.56]} />
          <meshStandardMaterial
            color="#0C1222"
            emissive="#1E3A5F"
            emissiveIntensity={0.5}
            roughness={0.1}
            metalness={0.3}
          />
        </mesh>
        {/* Monitor chin */}
        <mesh position={[0, -0.31, 0]}>
          <boxGeometry args={[0.3, 0.02, 0.04]} />
          <meshStandardMaterial color="#1F2937" roughness={0.2} metalness={0.5} />
        </mesh>
      </group>

      {/* Monitor stand - neck */}
      <mesh position={[0, 0.72, -0.35]}>
        <cylinderGeometry args={[0.025, 0.035, 0.35, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Monitor stand - base */}
      <RoundedBox args={[0.3, 0.02, 0.2]} position={[0, 0.55, -0.35]} radius={0.005}>
        <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.25} />
      </RoundedBox>

      {/* Keyboard */}
      <RoundedBox args={[0.55, 0.02, 0.18]} position={[-0.1, 0.55, 0.1]} radius={0.008}>
        <meshStandardMaterial color="#1F2937" roughness={0.6} metalness={0.2} />
      </RoundedBox>

      {/* Mouse */}
      <mesh position={[0.45, 0.545, 0.1]}>
        <capsuleGeometry args={[0.025, 0.04, 8, 12]} />
        <meshStandardMaterial color="#1F2937" roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Coffee mug */}
      <group position={[-0.85, 0.58, 0.2]}>
        <mesh>
          <cylinderGeometry args={[0.04, 0.035, 0.09, 12]} />
          <meshStandardMaterial color="#78350F" roughness={0.7} />
        </mesh>
        {/* Handle */}
        <mesh position={[0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.025, 0.008, 8, 12, Math.PI]} />
          <meshStandardMaterial color="#78350F" roughness={0.7} />
        </mesh>
      </group>

      {/* Pen holder */}
      <group position={[-0.65, 0.56, -0.25]}>
        <mesh>
          <cylinderGeometry args={[0.035, 0.035, 0.08, 8]} />
          <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.5} />
        </mesh>
        {/* Pens */}
        {[0, 0.015, -0.01].map((x, i) => (
          <mesh key={i} position={[x, 0.06, i * 0.008]} rotation={[0.05 * i, 0, 0.03 * (i - 1)]}>
            <cylinderGeometry args={[0.004, 0.004, 0.1, 6]} />
            <meshStandardMaterial color={["#DC2626", "#2563EB", "#111827"][i]} roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* Chair - ergonomic */}
      <group position={[0, 0, 1.3]}>
        {/* Seat */}
        <RoundedBox args={[0.55, 0.06, 0.55]} position={[0, 0.42, 0]} radius={0.025}>
          <meshStandardMaterial color="#1E293B" roughness={0.85} />
        </RoundedBox>
        {/* Backrest */}
        <RoundedBox args={[0.5, 0.65, 0.05]} position={[0, 0.78, -0.25]} radius={0.02}>
          <meshStandardMaterial color="#1E293B" roughness={0.85} />
        </RoundedBox>
        {/* Lumbar support */}
        <RoundedBox args={[0.35, 0.15, 0.06]} position={[0, 0.6, -0.24]} radius={0.03}>
          <meshStandardMaterial color="#253044" roughness={0.8} />
        </RoundedBox>
        {/* Armrests */}
        {[-0.3, 0.3].map((x, i) => (
          <group key={i}>
            <mesh position={[x, 0.52, -0.05]}>
              <boxGeometry args={[0.04, 0.15, 0.04]} />
              <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.3} />
            </mesh>
            <RoundedBox args={[0.06, 0.02, 0.2]} position={[x, 0.6, -0.02]} radius={0.008}>
              <meshStandardMaterial color="#1E293B" roughness={0.7} />
            </RoundedBox>
          </group>
        ))}
        {/* Gas lift */}
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.35, 12]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Base star */}
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <mesh
            key={i}
            position={[
              Math.cos((angle * Math.PI) / 180) * 0.25,
              0.05,
              Math.sin((angle * Math.PI) / 180) * 0.25,
            ]}
            rotation={[0, (-angle * Math.PI) / 180, 0]}
          >
            <boxGeometry args={[0.04, 0.04, 0.25]} />
            <meshStandardMaterial color="#4B5563" metalness={0.7} roughness={0.25} />
          </mesh>
        ))}
        {/* Casters */}
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <mesh
            key={`c${i}`}
            position={[
              Math.cos((angle * Math.PI) / 180) * 0.32,
              0.025,
              Math.sin((angle * Math.PI) / 180) * 0.32,
            ]}
          >
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#1F2937" roughness={0.3} metalness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ─── Bookshelf ─── */
export function Bookshelf({ position }: { position: [number, number, number] }) {
  const bookColors = ["#7C2D12", "#1E3A5F", "#4C1D95", "#064E3B", "#7F1D1D", "#3730A3", "#854D0E"];
  return (
    <group position={position}>
      {/* Shelf frame */}
      <RoundedBox args={[1.2, 2.2, 0.35]} radius={0.02}>
        <meshStandardMaterial color="#3D2B1F" roughness={0.65} />
      </RoundedBox>
      {/* Shelves */}
      {[0.7, 0.1, -0.5].map((y, si) => (
        <group key={si}>
          <mesh position={[0, y, 0.02]}>
            <boxGeometry args={[1.1, 0.04, 0.3]} />
            <meshStandardMaterial color="#4A3328" roughness={0.6} />
          </mesh>
          {/* Books on each shelf */}
          {bookColors.slice(si * 2, si * 2 + 3 + si).map((color, bi) => (
            <RoundedBox
              key={bi}
              args={[0.08 + Math.random() * 0.04, 0.4 + Math.random() * 0.15, 0.2]}
              position={[-0.35 + bi * 0.18, y + 0.28, 0.02]}
              radius={0.005}
            >
              <meshStandardMaterial color={color} roughness={0.8} />
            </RoundedBox>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ─── Floor Lamp ─── */
export function FloorLamp({ position, color = "#F59E0B" }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.15, 0.18, 0.04, 16]} />
        <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 1.75, 8]} />
        <meshStandardMaterial color="#4B5563" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Shade */}
      <mesh position={[0, 1.85, 0]}>
        <cylinderGeometry args={[0.08, 0.15, 0.25, 12, 1, true]} />
        <meshStandardMaterial color="#1F2937" roughness={0.7} side={2} />
      </mesh>
      {/* Bulb glow */}
      <mesh position={[0, 1.78, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
      </mesh>
      <pointLight position={[0, 1.7, 0]} intensity={0.6} color={color} distance={4} decay={2} />
    </group>
  );
}
