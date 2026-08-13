// Ambient declarations that belong to this project.
//
// These deliberately do NOT live in expo-env.d.ts: the Expo CLI rewrites that
// file whenever it starts, so anything added there is silently lost and the
// typecheck breaks again the next time someone runs `expo start`.

// Metro bundles CSS for the web target and no-ops it on native, but TypeScript
// needs telling that a bare `import "./global.css"` is a legal side-effect
// import rather than a missing module.
declare module "*.css";
