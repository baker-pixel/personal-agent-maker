import { useRef } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Text, RoundedBox, Float } from "@react-three/drei";
import * as THREE from "three";

export interface OfficeObject {
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

export function ClickableObject({
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
  const targetScale = useRef(new THREE.Vector3(1, 1, 1));

  useFrame(() => {
    if (!meshRef.current) return;
    const s = hovered ? 1.08 : 1;
    targetScale.current.set(s, s, s);
    meshRef.current.scale.lerp(targetScale.current, 0.1);
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
          emissiveIntensity={hovered ? 0.5 : 0}
          roughness={0.5}
          metalness={0.15}
        />
      </RoundedBox>

      <Float speed={2} floatIntensity={0.3} rotationIntensity={0}>
        <Text
          position={[0, obj.size[1] / 2 + 0.5, 0]}
          fontSize={0.22}
          color={hovered ? "#E8960D" : "#F5F0E8"}
          anchorX="center"
          anchorY="middle"
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
