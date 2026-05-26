export function avatarFor(name: string): string {
  return name && name.length > 0 ? name[0]!.toUpperCase() : '?';
}
