import type { ThreeElements } from "@react-three/fiber";

// Bind Fiber's finite element declarations to this app's React type instance.
// Other workspace packages can resolve a different React types peer version.
declare module "react" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration merging binds Fiber's exact elements to this React peer.
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration merging is required by the JSX runtime namespace.
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module "react/jsx-dev-runtime" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Keep the development JSX runtime bound to the same finite element types.
    interface IntrinsicElements extends ThreeElements {}
  }
}
