"""
Dynamo Python Script Node 1: Load JSON File
Reads the Revit output JSON file and extracts the elements array

IMPORTANT: This script requires EXACTLY 1 input!
Before running, make sure you've connected:
  IN[0] - File path to the JSON file (String node)

Example path:
  /home/azimsofi/kjm/ocr-test-playground/revit-outputs/zumen_04b-revit.json
"""

import json

# Input from Dynamo
json_file_path = IN[0]  # File path to the JSON file

try:
    # Read and parse JSON file
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Extract elements array from the JSON structure
    # Expected structure: { "metadata": {...}, "elements": [...] }
    elements = data.get('elements', [])

    # Output the elements array
    OUT = elements

except FileNotFoundError:
    # If file not found, output error message
    OUT = "ERROR: File not found - " + str(json_file_path)

except json.JSONDecodeError as e:
    # If JSON is malformed, output error message
    OUT = "ERROR: Invalid JSON - " + str(e)

except Exception as e:
    # Any other errors
    OUT = "ERROR: " + str(e)
