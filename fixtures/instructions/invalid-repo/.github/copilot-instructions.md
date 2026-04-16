# Global Rules

- Run `npm test` before opening pull requests.
- Use semicolons in TypeScript files.
- Keep React components in `app/` small and focused.
- Use uppercase keywords in SQL files under `db/`.
- Use sentence case headings in `docs/**/*.md`.
- Add type hints to Python scripts in `scripts/`.

When you are editing this repository, try to follow best practices and write clean code with the guidance above before deciding what to change because the team wants consistent work across many subsystems and documentation surfaces.

```ts
export function exampleFormatter(config: Record<string, string>): string {
  const firstSection = config.firstSection ?? "first-section";
  const secondSection = config.secondSection ?? "second-section";
  const thirdSection = config.thirdSection ?? "third-section";
  const fourthSection = config.fourthSection ?? "fourth-section";
  const fifthSection = config.fifthSection ?? "fifth-section";
  const sixthSection = config.sixthSection ?? "sixth-section";
  const seventhSection = config.seventhSection ?? "seventh-section";
  const eighthSection = config.eighthSection ?? "eighth-section";
  return [firstSection, secondSection, thirdSection, fourthSection, fifthSection, sixthSection, seventhSection, eighthSection].join(":");
}
```
