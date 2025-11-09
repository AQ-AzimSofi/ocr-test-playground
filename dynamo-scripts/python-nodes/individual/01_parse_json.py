"""
Dynamo Python Script Node 1: Parse JSON File
Reads the Revit JSON file and extracts the data

IMPORTANT: This script uses .NET File API for better compatibility with Dynamo/IronPython
"""

import clr
import sys

# Import .NET File API for reliable file reading in Dynamo
clr.AddReference('System')
from System.IO import File
from System.Text import Encoding

# Input from Dynamo: File path (string or Dynamo wrapper)
file_path = str(IN[0])  # Convert to string to handle Dynamo wrappers

try:
    # Read file using .NET API with UTF-8 encoding
    # This is more reliable than Python's open() in IronPython/Dynamo
    content = File.ReadAllText(file_path, Encoding.UTF8)

    # Import json module
    import json

    # Parse JSON content
    data = json.loads(content)

    # Extract key components
    metadata = data.get('metadata', {})
    elements = data.get('elements', [])

    # Get scaling info (for reference/debugging)
    coord_transform = metadata.get('coordinate_transformation', {})
    scaling_factor = coord_transform.get('scaling_factor', 0)
    scaling_confidence = coord_transform.get('scaling_confidence', 0)

    # Output data for next node
    OUT = [
        metadata,           # [0] Full metadata dictionary
        elements,           # [1] All elements array
        scaling_factor,     # [2] Scaling factor (for info)
        scaling_confidence, # [3] Confidence score (for info)
        len(elements)       # [4] Total element count
    ]

except Exception as e:
    # Error handling - output structured error
    error_msg = str(e)
    OUT = [
        {"error": error_msg},  # [0] Error as dict
        [],                     # [1] Empty elements
        0,                      # [2]
        0,                      # [3]
        0                       # [4]
    ]
