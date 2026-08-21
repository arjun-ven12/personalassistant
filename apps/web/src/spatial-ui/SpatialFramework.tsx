import {
  createContext,
  createElement,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  GestureName,
  SpatialComponentType,
  SpatialEventType,
  SpatialInteractionCapability,
  SpatialInteractionState,
} from "@alexa-control/shared";

export interface SpatialPointer {
  x: number;
  y: number;
  confidence: number;
  source: "browser" | "native" | "mouse" | "keyboard";
}

export interface SpatialTargetRegistration {
  id: string;
  type: SpatialComponentType;
  label: string;
  capabilities: SpatialInteractionCapability[];
  gestures: GestureName[];
  priority?: number;
  disabled?: boolean;
  onSpatialEvent?: (event: SpatialComponentEvent) => void;
}

export interface SpatialComponentEvent {
  type: SpatialEventType;
  targetId: string;
  gesture?: GestureName;
  confidence: number;
  state: SpatialInteractionState;
  at: number;
}

interface RegisteredTarget extends SpatialTargetRegistration {
  element: HTMLElement;
}

interface SpatialFrameworkValue {
  focusedId: string | null;
  hoveredId: string | null;
  selectedIds: string[];
  pointer: SpatialPointer | null;
  register: (element: HTMLElement, target: SpatialTargetRegistration) => () => void;
  updatePointer: (pointer: SpatialPointer | null) => void;
  confirmGesture: (gesture: GestureName, confidence: number) => void;
  emitInteraction: (event: SpatialComponentEvent) => void;
}

const SpatialFrameworkContext = createContext<SpatialFrameworkValue | null>(null);

type SpatialBridgeHandler = (pointer: SpatialPointer | null) => void;
type SpatialGestureHandler = (gesture: GestureName, confidence: number) => void;

class SpatialInteractionBridge {
  #pointerHandlers = new Set<SpatialBridgeHandler>();
  #gestureHandlers = new Set<SpatialGestureHandler>();

  onPointer(handler: SpatialBridgeHandler) {
    this.#pointerHandlers.add(handler);
    return () => this.#pointerHandlers.delete(handler);
  }

  onGesture(handler: SpatialGestureHandler) {
    this.#gestureHandlers.add(handler);
    return () => this.#gestureHandlers.delete(handler);
  }

  updatePointer(pointer: SpatialPointer | null) {
    for (const handler of this.#pointerHandlers) handler(pointer);
  }

  confirmGesture(gesture: GestureName, confidence: number) {
    for (const handler of this.#gestureHandlers) handler(gesture, confidence);
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export const spatialInteractionBridge = new SpatialInteractionBridge();

const hitBoxFor = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left / window.innerWidth,
    top: rect.top / window.innerHeight,
    right: rect.right / window.innerWidth,
    bottom: rect.bottom / window.innerHeight,
    area: rect.width * rect.height,
  };
};

const containsPointer = (element: HTMLElement, pointer: SpatialPointer) => {
  const box = hitBoxFor(element);
  if (!box) return false;
  return (
    pointer.x >= box.left &&
    pointer.x <= box.right &&
    pointer.y >= box.top &&
    pointer.y <= box.bottom
  );
};

export const SpatialFrameworkProvider = ({
  children,
  onInteraction,
}: {
  children: ReactNode;
  onInteraction?: (event: SpatialComponentEvent) => void;
}) => {
  const targets = useRef(new Map<string, RegisteredTarget>());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pointer, setPointer] = useState<SpatialPointer | null>(null);

  const emitInteraction = useCallback(
    (event: SpatialComponentEvent) => {
      const target = targets.current.get(event.targetId);
      target?.onSpatialEvent?.(event);
      target?.element.dispatchEvent(
        new CustomEvent("spatial-ui-interaction", {
          bubbles: true,
          detail: event,
        }),
      );
      onInteraction?.(event);
    },
    [onInteraction],
  );

  const register = useCallback(
    (element: HTMLElement, target: SpatialTargetRegistration) => {
      targets.current.set(target.id, { ...target, element });
      element.dataset.spatialId = target.id;
      element.dataset.spatialType = target.type;
      element.dataset.spatialLabel = target.label;
      return () => {
        targets.current.delete(target.id);
        delete element.dataset.spatialId;
        delete element.dataset.spatialType;
        delete element.dataset.spatialLabel;
      };
    },
    [],
  );

  const updatePointer = useCallback(
    (nextPointer: SpatialPointer | null) => {
      setPointer(nextPointer);
      if (!nextPointer) {
        setHoveredId(null);
        return;
      }
      const hit = [...targets.current.values()]
        .filter(
          (target) => !target.disabled && containsPointer(target.element, nextPointer),
        )
        .sort(
          (left, right) =>
            (right.priority ?? 0) - (left.priority ?? 0) ||
            (hitBoxFor(left.element)?.area ?? Number.MAX_SAFE_INTEGER) -
              (hitBoxFor(right.element)?.area ?? Number.MAX_SAFE_INTEGER),
        )[0];
      const nextHoveredId = hit?.id ?? null;
      setHoveredId(nextHoveredId);
      if (nextHoveredId && nextHoveredId !== hoveredId) {
        setFocusedId(nextHoveredId);
        emitInteraction({
          type: "spatial_focus",
          targetId: nextHoveredId,
          confidence: nextPointer.confidence,
          state: "focused",
          at: Date.now(),
        });
      }
    },
    [emitInteraction, hoveredId],
  );

  const confirmGesture = useCallback(
    (gesture: GestureName, confidence: number) => {
      const targetId = hoveredId ?? focusedId;
      if (!targetId) return;
      const target = targets.current.get(targetId);
      if (!target || target.disabled) return;
      const state: SpatialInteractionState =
        gesture === "open_palm"
          ? "cancelled"
          : gesture === "pinch" || gesture === "double_pinch"
            ? "activated"
            : "selected";
      const type: SpatialEventType =
        state === "activated"
          ? "spatial_activate"
          : state === "cancelled"
            ? "spatial_cancel"
            : "spatial_select";
      if (state === "selected" || state === "activated") {
        setSelectedIds((current) =>
          current.includes(targetId) ? current : [...current, targetId],
        );
      }
      emitInteraction({
        type,
        targetId,
        gesture,
        confidence,
        state,
        at: Date.now(),
      });
    },
    [emitInteraction, focusedId, hoveredId],
  );

  useEffect(() => {
    const unsubscribe = spatialInteractionBridge.onPointer((next) =>
      updatePointer(next),
    );
    return () => {
      unsubscribe();
    };
  }, [updatePointer]);
  useEffect(() => {
    const unsubscribe = spatialInteractionBridge.onGesture((gesture, confidence) =>
      confirmGesture(gesture, confidence),
    );
    return () => {
      unsubscribe();
    };
  }, [confirmGesture]);

  useEffect(() => {
    for (const target of targets.current.values()) {
      target.element.dataset.spatialState =
        target.id === focusedId
          ? "focused"
          : target.id === hoveredId
            ? "hover"
            : selectedIds.includes(target.id)
              ? "selected"
              : "idle";
    }
  }, [focusedId, hoveredId, selectedIds]);

  const value = useMemo(
    () => ({
      focusedId,
      hoveredId,
      selectedIds,
      pointer,
      register,
      updatePointer,
      confirmGesture,
      emitInteraction,
    }),
    [
      confirmGesture,
      emitInteraction,
      focusedId,
      hoveredId,
      pointer,
      register,
      selectedIds,
      updatePointer,
    ],
  );

  return (
    <SpatialFrameworkContext.Provider value={value}>
      {children}
      {pointer ? (
        <span
          aria-hidden="true"
          className="spatial-framework-cursor"
          style={
            {
              "--spatial-cursor-x": `${pointer.x * 100}vw`,
              "--spatial-cursor-y": `${pointer.y * 100}vh`,
            } as CSSProperties
          }
        />
      ) : null}
    </SpatialFrameworkContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSpatialFramework = () => {
  const context = useContext(SpatialFrameworkContext);
  if (!context) {
    throw new Error("useSpatialFramework must be used inside SpatialFrameworkProvider");
  }
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSpatial = <TElement extends HTMLElement>(
  target: SpatialTargetRegistration,
) => {
  const framework = useSpatialFramework();
  const elementRef = useRef<TElement | null>(null);

  useEffect(() => {
    if (!elementRef.current) return;
    return framework.register(elementRef.current, target);
  }, [framework, target]);

  const state: SpatialInteractionState =
    target.disabled === true
      ? "disabled"
      : framework.focusedId === target.id
        ? "focused"
        : framework.hoveredId === target.id
          ? "hover"
          : framework.selectedIds.includes(target.id)
            ? "selected"
            : "idle";

  return { ref: elementRef, state };
};

type SpatialProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  href?: string;
  spatialId: string;
  spatialType?: SpatialComponentType;
  spatialLabel: string;
  spatialCapabilities?: SpatialInteractionCapability[];
  spatialGestures?: GestureName[];
  spatialDisabled?: boolean;
  onSpatialEvent?: (event: SpatialComponentEvent) => void;
};

export const Spatial = ({
  as: Component = "div",
  spatialId,
  spatialType = "custom",
  spatialLabel,
  spatialCapabilities = ["hover", "focus", "select", "activate"],
  spatialGestures = ["point", "pinch", "hover"],
  spatialDisabled = false,
  onSpatialEvent,
  className,
  children,
  ...props
}: SpatialProps) => {
  const target = useMemo<SpatialTargetRegistration>(() => {
    const next: SpatialTargetRegistration = {
      id: spatialId,
      type: spatialType,
      label: spatialLabel,
      capabilities: spatialCapabilities,
      gestures: spatialGestures,
      disabled: spatialDisabled,
    };
    if (onSpatialEvent) next.onSpatialEvent = onSpatialEvent;
    return next;
  }, [
    onSpatialEvent,
    spatialCapabilities,
    spatialDisabled,
    spatialGestures,
    spatialId,
    spatialLabel,
    spatialType,
  ]);
  const { ref, state } = useSpatial<HTMLElement>(target);
  return createElement(
    Component,
    {
      ...props,
      className: ["spatial-target", className].filter(Boolean).join(" "),
      "data-spatial-state": state,
      ref,
    },
    children,
  );
};

export const SpatialButton = ({
  spatialId,
  spatialLabel,
  onClick,
  onSpatialEvent,
  ...props
}: Omit<SpatialProps, "as" | "spatialType"> & {
  onClick?: MouseEventHandler<HTMLElement>;
}) => (
  <Spatial
    {...props}
    as="button"
    onClick={onClick}
    onSpatialEvent={(event) => {
      onSpatialEvent?.(event);
      if (event.type === "spatial_activate") {
        const element = document.querySelector<HTMLButtonElement>(
          `[data-spatial-id="${CSS.escape(spatialId)}"]`,
        );
        element?.click();
      }
    }}
    spatialId={spatialId}
    spatialLabel={spatialLabel}
    spatialType="button"
  />
);

export const SpatialCard = (props: Omit<SpatialProps, "spatialType">) => (
  <Spatial {...props} spatialType="card" />
);

export const SpatialPanel = (props: Omit<SpatialProps, "spatialType">) => (
  <Spatial {...props} as="section" spatialType="panel" />
);
