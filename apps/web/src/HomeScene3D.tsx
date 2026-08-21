import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface SceneAgentNode {
  id: string;
  label: string;
  status: "available" | "busy" | "paused" | "disabled" | "unhealthy";
  health: "healthy" | "degraded" | "unhealthy" | "unknown";
  taskTitle: string;
  progress: number;
  latencyLabel: string;
  lastActivityLabel: string;
}

export interface SceneRepositoryNode {
  id: string;
  label: string;
  indexStatus: string;
  weight: number;
}

export interface SceneWorkflowNode {
  id: string;
  label: string;
  status: string;
  progress: number;
}

export interface HomeScene3DProps {
  repositories: SceneRepositoryNode[];
  workflows: SceneWorkflowNode[];
  validationCount: number;
}

const TAU = Math.PI * 2;
const slowRotation = TAU / 180;

const makeCirclePoints = (radius: number, segments: number, start = 0, end = TAU) =>
  Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + (end - start) * (index / segments);
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  });

const makeLine = (points: THREE.Vector3[], color: string, opacity: number) => {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, opacity, transparent: true });
  return new THREE.Line(geometry, material);
};

const CoreEnergy = () => {
  const core = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!core.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 0.75) * 0.035;
    core.current.scale.setScalar(pulse);
    core.current.rotation.y = clock.elapsedTime * 0.055;
  });
  return (
    <group ref={core}>
      <mesh>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshBasicMaterial color="#d6f7ff" opacity={0.96} transparent />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.44, 32, 32]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color="#57b8ff"
          depthWrite={false}
          opacity={0.18}
          transparent
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.004, 8, 160]} />
        <meshBasicMaterial color="#43e7a2" opacity={0.72} transparent />
      </mesh>
    </group>
  );
};

const LatLongLayer = ({
  radius,
  speed,
  opacity,
}: {
  radius: number;
  speed: number;
  opacity: number;
}) => {
  const group = useRef<THREE.Group>(null);
  const latitudeLines = useMemo(
    () =>
      [-60, -40, -20, 0, 20, 40, 60].map((lat) => {
        const y = Math.sin(THREE.MathUtils.degToRad(lat)) * radius;
        const ringRadius = Math.cos(THREE.MathUtils.degToRad(lat)) * radius;
        const line = makeLine(makeCirclePoints(ringRadius, 72), "#7fd4ff", opacity);
        line.position.y = y;
        line.rotation.x = Math.PI / 2;
        return line;
      }),
    [opacity, radius],
  );
  const longitudeLines = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const line = makeLine(makeCirclePoints(radius, 84), "#57b8ff", opacity * 0.72);
        line.rotation.y = (index / 12) * Math.PI;
        return line;
      }),
    [opacity, radius],
  );

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.rotation.y = clock.elapsedTime * speed;
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.035) * 0.01;
  });

  return (
    <group ref={group}>
      {latitudeLines.map((line, index) => (
        <primitive key={`lat-${index}`} object={line} />
      ))}
      {longitudeLines.map((line, index) => (
        <primitive key={`long-${index}`} object={line} />
      ))}
    </group>
  );
};

const EcosystemContinents = ({
  repositories,
}: {
  repositories: SceneRepositoryNode[];
}) => {
  const group = useRef<THREE.Group>(null);
  const loops = useMemo(() => {
    const count = Math.max(5, Math.min(14, repositories.length + 5));
    return Array.from({ length: count }, (_, continentIndex) => {
      const lat = THREE.MathUtils.degToRad(-45 + continentIndex * (90 / count));
      const lon = THREE.MathUtils.degToRad(continentIndex * 137.5);
      const center = new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        Math.cos(lat) * Math.sin(lon),
      ).multiplyScalar(1.575);
      const tangentA = new THREE.Vector3(-Math.sin(lon), 0, Math.cos(lon)).normalize();
      const tangentB = center.clone().cross(tangentA).normalize();
      const size =
        0.12 +
        (repositories[continentIndex % Math.max(1, repositories.length)]?.weight ?? 1) *
          0.035;
      const points = Array.from({ length: 22 }, (_, index) => {
        const angle = (index / 21) * TAU;
        const wobble = 0.76 + Math.sin(index * 1.7 + continentIndex) * 0.18;
        return center
          .clone()
          .add(tangentA.clone().multiplyScalar(Math.cos(angle) * size * wobble))
          .add(tangentB.clone().multiplyScalar(Math.sin(angle) * size * 0.58 * wobble))
          .normalize()
          .multiplyScalar(1.585);
      });
      return makeLine(points, continentIndex % 3 === 0 ? "#43e7a2" : "#9de6ff", 0.5);
    });
  }, [repositories]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.rotation.y = clock.elapsedTime * (slowRotation * 0.42);
  });

  return (
    <group ref={group}>
      {loops.map((line, index) => (
        <primitive key={`continent-${index}`} object={line} />
      ))}
    </group>
  );
};

const OrbitRing = ({
  radius,
  speed,
  tilt,
  color = "#57b8ff",
  opacity = 0.45,
  broken = false,
}: {
  radius: number;
  speed: number;
  tilt: [number, number, number];
  color?: string;
  opacity?: number;
  broken?: boolean;
}) => {
  const group = useRef<THREE.Group>(null);
  const segments = useMemo(() => {
    if (!broken) return [makeLine(makeCirclePoints(radius, 96), color, opacity)];
    return Array.from({ length: 4 }, (_, index) => {
      const start = index * (TAU / 4) + 0.16;
      return makeLine(
        makeCirclePoints(radius, 20, start, start + TAU / 6),
        color,
        opacity,
      );
    });
  }, [broken, color, opacity, radius]);
  useFrame(({ clock, pointer }) => {
    if (!group.current) return;
    group.current.rotation.z = clock.elapsedTime * speed;
    group.current.rotation.x = tilt[0] + pointer.y * 0.006;
    group.current.rotation.y = tilt[1] + pointer.x * 0.006;
  });
  return (
    <group ref={group} rotation={tilt} scale={[1.16, 0.78, 1]}>
      {segments.map((segment, index) => (
        <primitive key={`segment-${index}`} object={segment} />
      ))}
    </group>
  );
};

const ValidationRipples = ({ count }: { count: number }) => {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const phase = (clock.elapsedTime * 0.045 + index * 0.28) % 1;
      child.scale.setScalar(0.55 + phase * (1.3 + Math.min(count, 8) * 0.025));
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.26 * (1 - phase));
    });
  });
  return (
    <group ref={group} rotation={[1.15, 0.28, -0.35]}>
      {Array.from({ length: 3 }, (_, index) => (
        <mesh key={`validation-ripple-${index}`}>
          <torusGeometry args={[1.08 + index * 0.18, 0.004, 8, 160]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color="#ffc857"
            opacity={0.16}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
};

const HolographicCore = ({
  repositories,
  workflows,
  validationCount,
}: Pick<HomeScene3DProps, "repositories" | "workflows" | "validationCount">) => {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock, pointer, camera }) => {
    if (!group.current) return;
    group.current.rotation.y = clock.elapsedTime * slowRotation + pointer.x * 0.012;
    group.current.rotation.x = pointer.y * 0.008;
    group.current.position.y = Math.sin(clock.elapsedTime * 0.12) * 0.012;
    camera.position.z = 5.85;
  });

  return (
    <group ref={group} scale={1.06}>
      <mesh>
        <sphereGeometry args={[1.5, 64, 64]} />
        <meshBasicMaterial color="#0d293f" opacity={0.18} transparent />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.62, 64, 64]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color="#57b8ff"
          depthWrite={false}
          opacity={0.09}
          transparent
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.72, 48, 48]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color="#9de6ff"
          depthWrite={false}
          opacity={0.045}
          transparent
          wireframe
        />
      </mesh>
      <LatLongLayer opacity={0.34} radius={1.56} speed={slowRotation * 1.12} />
      <LatLongLayer opacity={0.18} radius={1.64} speed={-slowRotation * 0.68} />
      <EcosystemContinents repositories={repositories} />
      <CoreEnergy />
      <ValidationRipples count={validationCount} />
      {workflows.slice(0, 5).map((workflow, index) => (
        <OrbitRing
          broken={index % 2 === 0}
          color={
            workflow.status === "FAILED"
              ? "#ff5d6e"
              : workflow.status === "COMPLETED"
                ? "#43e7a2"
                : "#57b8ff"
          }
          key={workflow.id}
          opacity={0.22 + workflow.progress * 0.002}
          radius={2.08 + index * 0.12}
          speed={(index % 2 === 0 ? 0.006 : -0.004) / (index + 1)}
          tilt={[0.55 + index * 0.18, -0.35 + index * 0.21, index * 0.17]}
        />
      ))}
      <OrbitRing
        color="#9de6ff"
        radius={2.56}
        speed={0.0018}
        tilt={[1.15, 0.24, -0.6]}
      />
    </group>
  );
};

export const HomeScene3D = ({
  repositories,
  workflows,
  validationCount,
}: HomeScene3DProps) => (
  <Canvas
    camera={{ position: [0, 0, 5.85], fov: 43 }}
    dpr={[1, 1.35]}
    gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
  >
    <fog attach="fog" args={["#06111d", 7, 16]} />
    <ambientLight intensity={0.42} />
    <pointLight color="#57b8ff" intensity={18} position={[3, 3, 4]} />
    <pointLight color="#43e7a2" intensity={4.5} position={[-4, -2, 3]} />
    <pointLight color="#9de6ff" intensity={6} position={[0, 0, 4]} />
    <HolographicCore
      repositories={repositories}
      workflows={workflows}
      validationCount={validationCount}
    />
    <OrbitControls
      autoRotate={false}
      enableDamping={false}
      enablePan={false}
      maxDistance={7.8}
      minDistance={4.5}
      rotateSpeed={0.12}
      zoomSpeed={0.25}
    />
  </Canvas>
);

export default HomeScene3D;
