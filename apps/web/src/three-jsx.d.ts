import type { ThreeElements } from "@react-three/fiber";

// Bind Fiber's finite element declarations to this app's React type instance.
// Other workspace packages can resolve a different React types peer version.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module "react/jsx-dev-runtime" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
