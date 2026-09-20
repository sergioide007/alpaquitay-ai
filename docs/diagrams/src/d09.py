from dlib import *
W, H = 1120, 770
d = D(W, H, 'Design · project generation', 'Clean Architecture in generated projects',
      'ProjectBuilderSkill detects the stack, then applies the canonical layout. Dependencies only point inward.', '09-clean-architecture')
det = d.card(40, 122, 1040, 'detectStyleFromGoal()  →  ArchitecturalStyle', 'Markers: pom.xml · build.gradle · package.json (react / next / vue / express / expo) · angular.json · *.csproj · go.mod · requirements.txt (django / flask) · pyproject.toml — or the goal text (react-clean, spring-fullstack).', BLUE, h=74)
def stack(x, title, sub, layers, col):
    d.group(x, 236, 500, 436, title, col, sub, fo=.03)
    y = 268
    for name, path, note, c in layers:
        h = 84
        d.rect(x + 20, y, 460, h, c, c, 1.3, 9, None, .09, .65)
        d.text(x + 36, y + 26, name, 13.5, TEXT, True)
        d.text(x + 36, y + 46, path, 11, TEXT, False, mono=True, maxw=430)
        d.text(x + 36, y + 66, note, 11, MUTED, maxw=430)
        y += h + 14
    return y
stack(40, 'Java · Spring · Clean Architecture', 'Robert C. Martin', [
    ('Infrastructure', 'persistence/ · web/rest/ · config/', '@Entity + Spring Data JPA · thin @RestController · security, CORS, Swagger', AMBER),
    ('Application', 'service/ · dto/', 'Use cases (@Service) — no HTTP, no JPA', BLUE),
    ('Domain', 'model/ · port/', 'Pure POJOs (no @Entity) and repository / service interfaces', SIGNAL),
    ('Shared', 'exception/', '@ControllerAdvice and custom errors', GRAY)], AMBER)
stack(580, 'React · Clean Architecture', 'ISO/IEC/IEEE 12207', [
    ('Presentation', 'components/ · pages/ · layout/', 'Reusable UI, route-level pages, layout wrappers', AMBER),
    ('Infrastructure', 'api/ · storage/', 'Axios adapters (all HTTP lives here) · localStorage adapters', PINK),
    ('Application', 'use-case/ · store/', 'Business use cases · Zustand / Redux slices', BLUE),
    ('Domain', 'model/ · service/', 'TypeScript types (no React, no axios) · pure domain logic', SIGNAL)], PINK)
d.text(40, 702, 'Dependency rule:   infrastructure → application → domain      (the domain imports nothing from outside)', 12, SIGNAL, False, mono=True)
d.text(40, 724, 'Java packages live under src/main/java/com/company/project/, React layers under src/.', 11.5, MUTED)
d.arrow([(450, det.b), (450, 236)], MUTED); d.arrow([(990, det.b), (990, 236)], MUTED)
d.save('docs/diagrams')
