its a drone show for the gaelic holiday!

-----------------------------------------------

the index html and shapes js files control it all
they use some of the"tile" images

then there are some extra files from testing etc

so far pretty crude tools are built in to help manual design
hopefully they will be improved upon soon
but for now most of the actual arrangement was vibe coded with gemini 3.8 flash

-----------------------------------

the whole show is contained within the GLB Samhain_Drone_Show.glb

import it into Unity
Drag Samhain_Drone_Show from your Project window (bottom panel) directly into your Hierarchy window (left panel).
A new GameObject named Samhain_Drone_Show will appear in your Hierarchy, and you will see the drone spheres resting in the Scene view.

to animate it
Right-click an empty space in your Project window and select Create → Animation → Animator Controller (or Create → Animator Controller depending on your Unity version). Name it DroneController.
A new asset with a grid icon named DroneController appears in your project folder.

Double-click DroneController to open the Animator window tab. Next, click the small arrow > next to Samhain_Drone_Show.glb in your Project panel to expand its nested assets, then drag the DroneShowFlight clip into the central grid of the Animator window.
An orange rectangular state block labeled DroneShowFlight appears in the Animator graph, connected automatically to the green "Entry" node.

Click on the Samhain_Drone_Show object in your Hierarchy window. In the Inspector on the right, locate the Animator component. Drag your DroneController asset from the Project window into the empty Controller slot.
The Controller field displays DroneController (AnimatorController) instead of None.

click play to test.


for the custom shader
In Unity's Project panel, right-click inside your Assets/DroneShow/ folder.
Select Create → Shader → Unlit Shader (or Universal Render Pipeline → Unlit Shader).
Name the file DroneSamhainEmissive.shader.
Double-click to open it in your code editor, erase all default text, and paste the custom_shader code

then create the material
In the Project window, right-click on DroneSamhainEmissive.shader.
Select Create → Material. Name the material M_SamhainDroneColor.
Select M_SamhainDroneColor to view its Inspector settings. You will see sliders for Base Emission Boost (default 3.0), Sparkle Flash Boost (default 8.0), and the gradient color pickers.

to batch assign the material
In your Hierarchy window, select the parent Samhain_Drone_Show GameObject.
Expand it to view the entire fleet.  
Click the first Drone_0 in the list, hold Shift, and scroll down to click the last Drone_799 to select all 800 simultaneously.
With all 800 drones highlighted, look at the Inspector on the right. You will see a shared Materials slot labeled Element 0.
Drag M_SamhainDroneColor directly into the Element 0 field.

press play to test
