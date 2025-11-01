// Utility to join conditional class names; formatting only, no behavior changes.
export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
