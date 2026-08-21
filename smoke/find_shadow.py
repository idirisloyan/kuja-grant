import ast, os, sys

ROOT = r"C:\Users\IdirisLoyan\kuja-grant\app"

def iter_py(root):
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if f.endswith(".py"):
                yield os.path.join(dp, f)

class FuncCollector(ast.NodeVisitor):
    """Collect all FunctionDef/AsyncFunctionDef nodes."""
    def __init__(self):
        self.funcs = []
    def visit_FunctionDef(self, node):
        self.funcs.append(node)
        self.generic_visit(node)
    def visit_AsyncFunctionDef(self, node):
        self.funcs.append(node)
        self.generic_visit(node)

def direct_body_nodes(func):
    """Yield all statements/expr nodes in func body EXCLUDING nested function/lambda/class bodies.
       We still descend into if/for/while/try/with/etc."""
    boundaries = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
    def walk(node):
        for child in ast.iter_child_nodes(node):
            yield child
            if not isinstance(child, boundaries):
                yield from walk(child)
    yield from walk(func)

def collect(func):
    # local imports (direct in function scope, not nested)
    local_imports = {}   # name -> min lineno
    other_bindings = {}  # name -> list of linenos (assign/for/with/except/params)
    usages = {}          # name -> list of Load linenos

    # params bind at function def line
    for a in list(func.args.posonlyargs)+list(func.args.args)+list(func.args.kwonlyargs):
        other_bindings.setdefault(a.arg, []).append(func.lineno)
    if func.args.vararg: other_bindings.setdefault(func.args.vararg.arg, []).append(func.lineno)
    if func.args.kwarg: other_bindings.setdefault(func.args.kwarg.arg, []).append(func.lineno)

    for n in direct_body_nodes(func):
        if isinstance(n, ast.Import):
            for alias in n.names:
                nm = (alias.asname or alias.name.split(".")[0])
                local_imports[nm] = min(local_imports.get(nm, 10**9), n.lineno)
        elif isinstance(n, ast.ImportFrom):
            for alias in n.names:
                nm = (alias.asname or alias.name)
                if nm == "*":
                    continue
                local_imports[nm] = min(local_imports.get(nm, 10**9), n.lineno)
        elif isinstance(n, ast.Name):
            if isinstance(n.ctx, ast.Load):
                usages.setdefault(n.id, []).append(n.lineno)
            elif isinstance(n.ctx, (ast.Store, ast.Del)):
                other_bindings.setdefault(n.id, []).append(n.lineno)
        elif isinstance(n, ast.arg):
            other_bindings.setdefault(n.arg, []).append(n.lineno)
        elif isinstance(n, ast.ExceptHandler):
            if n.name:
                other_bindings.setdefault(n.name, []).append(n.lineno)
    return local_imports, other_bindings, usages

def module_level_imports(tree):
    names = set()
    for n in tree.body:
        if isinstance(n, ast.Import):
            for alias in n.names:
                names.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(n, ast.ImportFrom):
            for alias in n.names:
                if alias.name != "*":
                    names.add(alias.asname or alias.name)
    return names

results = []
for path in iter_py(ROOT):
    try:
        src = open(path, encoding="utf-8").read()
        tree = ast.parse(src)
    except Exception as e:
        print("PARSE FAIL", path, e, file=sys.stderr)
        continue
    modimports = module_level_imports(tree)
    fc = FuncCollector(); fc.visit(tree)
    for func in fc.funcs:
        local_imports, other_bindings, usages = collect(func)
        for nm, imp_line in local_imports.items():
            use_lines = sorted(usages.get(nm, []))
            # earliest binding other than this import
            earlier_binds = sorted([l for l in other_bindings.get(nm, []) if l < imp_line])
            uses_before = [l for l in use_lines if l < imp_line]
            uses_after = [l for l in use_lines if l > imp_line]
            status = None
            earliest_use = None
            if uses_before:
                # Is there an earlier binding that would satisfy the first use?
                first_use = uses_before[0]
                preceding_bind = [l for l in earlier_binds if l <= first_use]
                if preceding_bind:
                    status = "GUARDED"  # bound earlier by assignment/param, import is redundant shadow
                    earliest_use = first_use
                else:
                    status = "LIVE"
                    earliest_use = first_use
            elif uses_after:
                status = "LATENT"
                earliest_use = uses_after[0]
            else:
                status = "NOUSE"  # imported but never used except maybe on import line
            results.append({
                "file": path, "func": func.name, "func_line": func.lineno,
                "name": nm, "imp_line": imp_line, "status": status,
                "earliest_use": earliest_use, "modlevel": nm in modimports,
                "uses_before": uses_before, "uses_after": uses_after,
            })

order = {"LIVE":0,"GUARDED":1,"LATENT":2,"NOUSE":3}
results.sort(key=lambda r:(order[r["status"]], r["file"], r["imp_line"]))

def rel(p): return p.replace(ROOT+"\\","").replace("\\","/")

print("=== LIVE (used before local import; real 500 risk) ===")
for r in results:
    if r["status"]=="LIVE":
        print(f'{rel(r["file"])}:{r["imp_line"]} | {r["func"]}() @L{r["func_line"]} | {r["name"]} | earliest_use=L{r["earliest_use"]} | modlevel={r["modlevel"]} | uses_before={r["uses_before"]}')

print("\n=== GUARDED (used before import BUT bound earlier by assign/param — usually safe, shadow smell) ===")
for r in results:
    if r["status"]=="GUARDED":
        print(f'{rel(r["file"])}:{r["imp_line"]} | {r["func"]}() @L{r["func_line"]} | {r["name"]} | earliest_use=L{r["earliest_use"]} | modlevel={r["modlevel"]}')

print("\n=== LATENT (used only after import; harmless shadow) — count only ===")
from collections import Counter
c = Counter(rel(r["file"]) for r in results if r["status"]=="LATENT")
for f,n in c.most_common():
    print(f"{f}: {n}")

print("\n=== SMK-001 shape: modlevel AND local re-import (all statuses) ===")
for r in results:
    if r["modlevel"] and r["status"] in ("LIVE","GUARDED","LATENT"):
        print(f'{rel(r["file"])}:{r["imp_line"]} | {r["func"]}() | {r["name"]} | {r["status"]} | earliest_use=L{r["earliest_use"]}')

print("\nTOTAL funcs-with-local-imports entries:", len(results))
