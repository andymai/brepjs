#!/usr/bin/env bash
# Sets up the official buildingSMART Validation Service rule engine
# (ifc-gherkin-rules) for local runs, so every normative rule the service
# checks can run against a model before anything is uploaded.
#
#   bash scripts/setupGherkinRunner.sh /path/to/workdir
#   /path/to/workdir/run-gherkin.sh model.ifc
#
# Pinned to known-good SHAs. Local adjustments applied (each is an upstream
# environment assumption, not a rule change):
#   1. behave==1.2.6 exactly — behave 1.3.x matches step text case-sensitively,
#      leaving hundreds of the repo's steps undefined.
#   2. ifc-validation-data-model checked out as the sibling package the code
#      expects (the pip package resolves as a namespace package, whose
#      __file__ is None and crashes validation_results.py).
#   3. A first-sorting shim re-runs the custom parse-type registration from
#      features/steps/__init__.py, which behave skips (underscore prefix).
#   4. A second shim pre-imports the nested step packages under canonical
#      names — behave exec-loads steps.py as a plain file, which shadows the
#      nested steps/ package and silently drops its step definitions.
#   5. The pset-table loader's quote-swap JSON parse is replaced with
#      ast.literal_eval — it crashes on apostrophes in the official CSV.
set -euo pipefail

WORKDIR="${1:?usage: setupGherkinRunner.sh /path/to/workdir}"
GHERKIN_SHA=893f8275049b8960c3ce0c7379b4b57aefeaa8f9
DATAMODEL_SHA=cad20d3f67728fb53b7e65fe8eb903a9ad28f412

mkdir -p "$WORKDIR"
cd "$WORKDIR"

[ -d ifc-gherkin-rules ] || git clone https://github.com/buildingSMART/ifc-gherkin-rules
git -C ifc-gherkin-rules checkout "$GHERKIN_SHA"
[ -d ifc-validation-data-model ] || git clone https://github.com/buildingSMART/ifc-validation-data-model
git -C ifc-validation-data-model checkout "$DATAMODEL_SHA"
rm -rf ifc-gherkin-rules/ifc_validation_models
cp -r ifc-validation-data-model ifc-gherkin-rules/ifc_validation_models

[ -d venv ] || python3 -m venv venv
# Every version pinned to the set the fixtures were proven against — an
# unpinned behave upgrade is exactly what silently broke step matching once.
./venv/bin/pip install --quiet \
  "behave==1.2.6" "parse==1.22.1" "parse_type==0.6.6" "ifcopenshell==0.8.5" \
  "pytest==9.1.1" "pandas==3.0.5" "numpy==2.5.2" "tabulate==0.10.0" \
  "pyparsing==3.3.2" "pydantic==2.13.4" "SQLAlchemy==2.0.52" \
  "python-dotenv==1.2.3" "Django==6.1" "pyspellchecker==0.9.0" "pydot==4.0.1" \
  "mpmath==1.4.1" "networkx==3.6.1" "rtree==1.4.1" "shapely==2.1.2" \
  "scipy==1.18.0" "pyproj==3.7.2" "Deprecated==1.3.1"

cat > ifc-gherkin-rules/features/steps/aaa_local_type_registration.py <<'EOF'
# Local shim: behave skips __init__.py, so the custom parse types registered
# there never load. Re-run the registration first (this module sorts first).
import json
from pathlib import Path
from behave import register_type
from parse_type import TypeBuilder

json_file = Path(__file__).parent / "registered_type_definitions.json"
with open(json_file, "r", encoding="utf-8") as file:
    type_definitions = json.load(file)

for name, values in type_definitions.items():
    register_type(**{name: TypeBuilder.make_enum({v: v for v in values})})
EOF

cat > ifc-gherkin-rules/features/steps/aab_local_preload.py <<'EOF'
# Local shim: behave exec-loads steps.py as a plain file, which shadows the
# nested steps/ package in its exec namespace. Pre-import every nested module
# under its canonical name so decorators register once and later imports hit
# the module cache.
import importlib
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

for mod in [
    'givens.attributes', 'givens.entities', 'givens.relationships', 'givens.values',
    'thens.alignment', 'thens.attributes', 'thens.geometry', 'thens.nesting',
    'thens.reference', 'thens.relations', 'thens.values', 'thens.existence',
    'steps.attribute_selection', 'steps.attribute_value', 'steps.entity_selection',
    'steps.model_traversal', 'steps.representation', 'steps.propertysets_qtys_units',
    'steps.crs',
]:
    importlib.import_module(mod)
EOF

python3 - <<'EOF'
from pathlib import Path
p = Path('ifc-gherkin-rules/features/steps/steps/propertysets_qtys_units.py')
s = p.read_text()
old = '''            return json.loads(s.replace("'", '"'))'''
new = '''            import ast
            return ast.literal_eval(s)'''
if old in s:
    p.write_text(s.replace(old, new))
    print('pset table loader patched')
else:
    print('pset table loader already patched (or upstream fixed)')
EOF

cat > run-gherkin.sh <<'EOF'
#!/usr/bin/env bash
# Runs the complete official normative rule catalog against an IFC file.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
INPUT="$(realpath "${1:?usage: run-gherkin.sh model.ifc}")"
cd "$HERE/ifc-gherkin-rules"
"$HERE/venv/bin/python" -m behave --no-capture --tags=-disabled \
  --define "input=$INPUT" --define max_outcomes_per_rule=0 2>&1 |
  grep -E "Failing scenarios|features/rules|scenarios passed|steps passed" | tail -20
EOF
chmod +x run-gherkin.sh
echo "ready: $WORKDIR/run-gherkin.sh model.ifc"
