"""
Dynamo Python Script Node 3: Create Walls in Revit
Creates wall elements using the Revit API

IMPORTANT: This script requires EXACTLY 3 inputs!
Before running, make sure you've connected:
  IN[0] - Wall data from Python Script 2 (list of wall dictionaries)
  IN[1] - Wall Type from Wall Types selector node
  IN[2] - Level from Levels selector node

If you get "IndexError: list index out of range", it means
Wall Types or Levels node is not connected yet.
"""

import clr

# Import Revit API
clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')

from Autodesk.Revit.DB import *
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

# Inputs from Dynamo (ALL 3 REQUIRED!)
wall_data = IN[0]      # Wall data from Python Script 2
wall_type = IN[1]      # Wall Type (from Wall Types selector node)
level = IN[2]          # Level (from Levels selector node)

# Get current Revit document
doc = DocumentManager.Instance.CurrentDBDocument

# Unwrap Revit elements from Dynamo wrappers
wall_type = UnwrapElement(wall_type)
level = UnwrapElement(level)

# Storage for created walls
created_walls = []
success_count = 0
failed_count = 0
errors = []

# Start Revit transaction
TransactionManager.Instance.EnsureInTransaction(doc)

try:
    for wall_info in wall_data:
        try:
            # Extract coordinates (already in feet)
            start = wall_info['start']
            end = wall_info['end']

            # Create Revit points
            start_point = XYZ(start['x'], start['y'], start['z'])
            end_point = XYZ(end['x'], end['y'], end['z'])

            # Create line (curve) between points
            line = Line.CreateBound(start_point, end_point)

            # Get wall height (already in feet)
            height = wall_info['height']

            # Create the wall
            # Wall.Create(document, curve, wallTypeId, levelId, height, offset, flip, structural)
            new_wall = Wall.Create(
                doc,               # Document
                line,              # Curve (line between start and end)
                wall_type.Id,      # Wall type ID
                level.Id,          # Level ID
                height,            # Height in feet
                0,                 # Offset from level (0 = on the level)
                False,             # Flip (orientation)
                False              # Structural (set to False for now)
            )

            # Store created wall
            created_walls.append(new_wall)
            success_count += 1

        except Exception as e:
            # Log individual wall creation errors
            failed_count += 1
            errors.append({
                'wall_id': wall_info.get('id', 'unknown'),
                'error': str(e)
            })

finally:
    # Commit the transaction
    TransactionManager.Instance.TransactionTaskDone()

# Output results
OUT = [
    created_walls,    # [0] List of created Wall elements
    success_count,    # [1] Number of successfully created walls
    failed_count,     # [2] Number of failed walls
    errors            # [3] List of error messages (if any)
]
