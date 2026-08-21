import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  BrainCircuit,
  Database,
  GitBranch,
  Maximize2,
  Network,
  Shield,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { ApiClient } from "./api.js";
import { usePersistentSpatialRuntime } from "./PersistentSpatialRuntime.js";

const TAU = Math.PI * 2;

const runtimeStateClass = (state: string) =>
  state === "tracking"
    ? "space-runtime-good"
    : state === "error"
      ? "space-runtime-bad"
      : "space-runtime-waiting";

const lineObject = (radius: number, color: string, opacity: number) => {
  const points = Array.from({ length: 96 }, (_, index) => {
    const angle = (index / 95) * TAU;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, opacity, transparent: true });
  return new THREE.Line(geometry, material);
};

const HolographicCore = ({
  agents,
  workflows,
  memories,
}: {
  agents: number;
  workflows: number;
  memories: number;
}) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.08;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.45) * 0.06;
    ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 0.9) * 0.018);
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.72, 64, 64]} />
        <meshBasicMaterial color="#061928" opacity={0.68} transparent />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.9, 64, 64]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color="#57B8FF"
          opacity={0.16}
          transparent
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.02, 42, 42]} />
        <meshBasicMaterial color="#9de6ff" opacity={0.18} transparent wireframe />
      </mesh>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={lineObject(1.18, "#43E7A2", 0.46)} />
      </group>
      <group rotation={[0.55, 0.2, 0.35]}>
        <primitive object={lineObject(1.55, "#57B8FF", 0.3)} />
      </group>
      <group rotation={[1.1, -0.5, 0.65]}>
        <primitive object={lineObject(2.05, "#9de6ff", 0.18)} />
      </group>
      {Array.from({ length: Math.max(8, Math.min(20, agents + workflows + 8)) }).map(
        (_, index) => {
          const angle = (index / 20) * TAU;
          const radius = 1.55 + (index % 3) * 0.34;
          return (
            <mesh
              key={index}
              position={[
                Math.cos(angle) * radius,
                Math.sin(angle * 1.7) * 0.55,
                Math.sin(angle) * radius,
              ]}
            >
              <sphereGeometry args={[0.035 + (index % 4) * 0.006, 12, 12]} />
              <meshBasicMaterial
                blending={THREE.AdditiveBlending}
                color={index % 5 === 0 ? "#43E7A2" : "#57B8FF"}
                opacity={0.78}
                transparent
              />
            </mesh>
          );
        },
      )}
      {Array.from({ length: Math.max(5, Math.min(16, memories + 5)) }).map(
        (_, index) => {
          const angle = (index / 16) * TAU;
          return (
            <mesh
              key={`memory-${index}`}
              position={[
                Math.cos(angle) * 2.55,
                -1.05 + Math.sin(index) * 0.28,
                Math.sin(angle) * 2.55,
              ]}
            >
              <octahedronGeometry args={[0.045, 0]} />
              <meshBasicMaterial color="#FFC857" opacity={0.48} transparent />
            </mesh>
          );
        },
      )}
    </group>
  );
};

const CommandSpaceScene = ({
  agents,
  workflows,
  memories,
}: {
  agents: number;
  workflows: number;
  memories: number;
}) => {
  const particles = useMemo(() => {
    const seeded = Array.from({ length: 160 }, (_, index) => {
      const angle = index * 2.399963;
      const radius = 2.5 + ((index * 17) % 70) / 10;
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        -2.4 + ((index * 29) % 52) / 10,
        Math.sin(angle) * radius,
      );
    });
    return new THREE.BufferGeometry().setFromPoints(seeded);
  }, []);
  const particleRef = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    if (!particleRef.current) return;
    particleRef.current.rotation.y = clock.elapsedTime * 0.012;
  });
  return (
    <>
      <fog attach="fog" args={["#020407", 7, 22]} />
      <ambientLight intensity={0.38} />
      <pointLight color="#57B8FF" intensity={22} position={[3.6, 4, 5]} />
      <pointLight color="#43E7A2" intensity={6} position={[-5, -2, 3]} />
      <points ref={particleRef} geometry={particles}>
        <pointsMaterial
          blending={THREE.AdditiveBlending}
          color="#9de6ff"
          opacity={0.36}
          size={0.018}
          transparent
        />
      </points>
      <HolographicCore agents={agents} memories={memories} workflows={workflows} />
      <OrbitControls
        enableDamping
        enablePan={false}
        maxDistance={9.5}
        minDistance={4.2}
        rotateSpeed={0.22}
        zoomSpeed={0.34}
      />
    </>
  );
};

export const SpatialCommandSpace = ({
  apiClient,
  onExit,
}: {
  apiClient: ApiClient;
  onExit: () => void;
}) => {
  const persistentRuntime = usePersistentSpatialRuntime();
  const [selectedObject, setSelectedObject] = useState("AI Core");
  const commandSpace = useQuery({
    queryKey: ["spatial-command-space"],
    queryFn: apiClient.getSpatialCommandSpace,
    refetchInterval: 20_000,
  });
  const agents = useQuery({
    queryKey: ["agents-dashboard"],
    queryFn: apiClient.getAgentsDashboard,
    refetchInterval: 20_000,
  });
  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: apiClient.getWorkflows,
    refetchInterval: 20_000,
  });
  const memory = useQuery({
    queryKey: ["memory-dashboard"],
    queryFn: apiClient.getMemoryCenter,
    refetchInterval: 30_000,
  });
  const agentCount = agents.data?.agents.length ?? 8;
  const workflowCount = workflows.data?.length ?? 0;
  const memoryCount = memory.data?.statistics.totalMemories ?? 0;
  const preference = commandSpace.data?.preferences[0];
  const visualizations = commandSpace.data?.visualizations ?? [];
  const runtimeFrame = persistentRuntime.frame;

  return (
    <section className="spatial-command-space" aria-label="Spatial Command Space">
      <div className="space-backdrop" aria-hidden="true" />
      <header className="space-topbar">
        <div>
          <p className="eyebrow">Spatial operating environment</p>
          <h1>Spatial Command Space</h1>
        </div>
        <div className="space-actions">
          <span>{preference?.selectedThemeId ?? "spatial.theme.jarvis"}</span>
          <span className={runtimeStateClass(runtimeFrame.state)}>
            {runtimeFrame.state.replaceAll("_", " ")}
          </span>
          <button
            onClick={() => {
              onExit();
            }}
            type="button"
          >
            <X size={15} /> Exit spatial mode
          </button>
        </div>
      </header>

      <div className="space-scene">
        <Canvas
          camera={{ position: [0, 1.2, 7.2], fov: 46 }}
          dpr={[1, 1.45]}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        >
          <CommandSpaceScene
            agents={agentCount}
            memories={memoryCount}
            workflows={workflowCount}
          />
        </Canvas>
        <div className="space-hand-overlay" aria-hidden="true">
          <span className="space-gesture-label">
            Persistent runtime · {runtimeFrame.handsTracked} hand
            {runtimeFrame.handsTracked === 1 ? "" : "s"} ·{" "}
            {Math.round(runtimeFrame.confidence * 100)}%
          </span>
        </div>
      </div>

      <aside className="space-panel space-panel-left">
        <p className="eyebrow">Agent constellation</p>
        <button
          data-spatial-id="agent_constellation"
          onClick={() => setSelectedObject("Agent Constellation")}
          type="button"
        >
          <Bot size={15} /> {agentCount} agents
        </button>
        <button
          data-spatial-id="workflow_galaxy"
          onClick={() => setSelectedObject("Workflow Galaxy")}
          type="button"
        >
          <Workflow size={15} /> {workflowCount} workflows
        </button>
        <button
          data-spatial-id="knowledge_universe"
          onClick={() => setSelectedObject("Knowledge Universe")}
          type="button"
        >
          <BrainCircuit size={15} /> {memoryCount} memories
        </button>
      </aside>

      <aside className="space-panel space-panel-right">
        <p className="eyebrow">Object inspector</p>
        <h2>{selectedObject}</h2>
        <p>
          Inspection is visual and intent-routed. No privileged action executes from
          this scene.
        </p>
        <p className="space-runtime-note">
          {persistentRuntime.runtimeError ?? persistentRuntime.lastAction}
          {!persistentRuntime.active && !persistentRuntime.paused ? (
            <button onClick={() => void persistentRuntime.start()} type="button">
              Start camera
            </button>
          ) : null}
        </p>
        <div className="space-stat-grid">
          <span>
            <Shield size={14} /> governed
          </span>
          <span>
            <Database size={14} /> postgres
          </span>
          <span>
            <Network size={14} /> intent routed
          </span>
          <span>
            <Maximize2 size={14} /> spatial
          </span>
        </div>
      </aside>

      <footer className="space-dock" aria-label="Spatial dock">
        {visualizations.slice(0, 6).map((item) => (
          <button
            data-spatial-id={`space_dock_${item.visualizationType}`}
            key={item.id}
            onClick={() => setSelectedObject(item.title)}
            type="button"
          >
            {item.visualizationType === "workflow_galaxy" ? (
              <GitBranch size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {item.title}
          </button>
        ))}
      </footer>
    </section>
  );
};
