This is a unified page for our official Phaser runtimes. Here you can find a list of our official Phaser runtimes along with the respective compatible versions:

Runtime	Phaser version	Maintained
spine-phaser-v4	
4 (minimum 4.0.0-rc.1)

Yes

spine-phaser-v3	
3 (minimum 3.60.0)

Yes

spine-phaser	
3 (minimum 3.60.0)

No (switch to spine-phaser-v3)

Unless otherwise indicated, the examples and GitHub file links refer to the v4 version. However, everything applies to the v3 version by simply replace -v4 with -v3 from paths and links.

The spine-phaser runtime is implemented on top of spine-ts core, a TypeScript implementation of the renderer-agnostic Spine Runtimes core APIs. The spine-phaser runtime supports all platforms supported by Phaser 3 and 4, including rendering via the Canvas APIs as well as rendering via WebGL.

The spine-phaser runtime supports all Spine features when using the Phaser WebGL renderer. When using the Phaser Canvas renderer, the spine-phaser runtime does not support meshes, tint black, or blend modes.

Installation
To use spine-phaser in your Phaser project, you must first include its sources.

Vanilla JavaScript
In vanilla JavaScript, use a script tag to include the spine-phaser runtime from unpkg:

<script src="https://unpkg.com/@esotericsoftware/spine-phaser-v4@4.2.*/dist/iife/spine-phaser-v4.js"></script>
Note: Ensure that the major.minor version of spine-phaser matches the major.minor Spine Editor version you are exporting from. See Synchronizing versions for more information.

Next, add the Spine scene plugin to your Phaser game configuration:

const config = {
 ...
 plugins: {
    scene: [
       { key: "spine.SpinePlugin", plugin: spine.SpinePlugin, mapping: "spine" }
    ]
 }
}
new Phaser.Game(config);
All scenes in your project can now use the spine-phaser runtime.

Check out basic-vanilla-js-example.html for a full example.

The spine-phaser package also provides source maps for debugging, as well as minified versions of spine-phaser, which can be used by replacing the .js file suffix with .min.js in the unpkg URLs.

For local vendoring, you can build spine-phaser.js by following the instructions in the spine-ts README.md.

NPM or Yarn
When using NPM or Yarn for dependency management, add spine-phaser the usual way:

npm install @esotericsoftware/spine-phaser-v4@~4.2.0
Note: Ensure that the major.minor version of spine-phaser matches the major.minor Spine Editor version you are exporting from. See Synchronizing versions for more information.

Next, add the Spine scene plugin to your Phaser game configuration:

import Phaser from "phaser"
import {SpinePlugin} from "@esotericsoftware/spine-phaser-v4"

const config = {
 ...
 plugins: {
    scene: [
       { key: "spine.SpinePlugin", plugin: SpinePlugin, mapping: "spine" }
    ]
 }
}
new Phaser.Game(config);
All scenes in your project can now use the spine-phaser runtime.

Check out the spine-phaser esbuild/TypeScript project for minimal example.

Our module packages also contain source maps as well as d.ts typings for improved debugging and development.

Samples
The spine-phaser runtime includes several samples demonstrating its feature set.

To run the examples locally:

Install Git and Node.js for your operating system.
Clone the spine-runtimes repository: git clone https://github.com/esotericsoftware/spine-runtimes
At the terminal, navigate to spine-runtimes/spine-ts, then run npm install & npm run dev.
This builds the spine-phaser runtime, then opens a browser, displaying the example index for all spine-ts based runtimes.

Click on the spine-phaser example you are interested in, and check out the code in the spine-runtimes/spine-ts/spine-phaser-v4/example folder.

Updating the spine-phaser Runtime
Before updating your project's spine-phaser runtime, please consult our guide on Spine editor and runtime version management.

To update the spine-phaser runtime in vanilla JavaScript, change the version string in the src attribute or the script tag fetching spine-phaser from unpkg.

To update the spine-phaser runtime when managing dependencies with NPM or Yarn, change the version string in your package.json file.

Note: If you change the major.minor version of the spine-phaser package, you have to re-export your Spine skeletons with the same Spine Editor major.minor version! See Synchronizing versions for more information.

Using spine-phaser
The spine-phaser runtime supports all Spine features when using the Phaser WebGL renderer. When using the Phaser Canvas renderer, the spine-phaser runtime does not support meshes, tint black, or blend modes.

Asset Management
Exporting for spine-phaser


Follow the instructions in the Spine User Guide on how to:

Export skeleton & animation data
Export texture atlases containing the images of your skeleton
An export of the skeleton data and texture atlas of your skeleton will yield the following files:



skeleton-name.json or skeleton-name.skel, containing your skeleton and animation data, either in the JSON or binary format.
skeleton-name.atlas, containing information about the texture atlas.
One or more .png files, each representing one page of your texture atlas containing the packed images your skeleton uses.
Note: You should prefer binary skeleton exports over JSON exports, as they are smaller in size and faster to load.

When serving these files, make sure the server emits the correct MIME types.

Updating Spine Assets
During development, you may frequently update your Spine skeleton data and texture atlas files. You can simply overwrite these source files (.json, .skel, .atlas, .png) by re-exporting from the Spine Editor and replacing the existing files in your Phaser project.

Ensure that the major.minor version of spine-phaser matches the major.minor Spine Editor version you are exporting from. See Synchronizing versions for more information.

Core classes
The spine-phaser API is built on top of the generic TypeScript spine-core runtime, which provides platform independent core classes and algorithms to load, query, modify, and animate Spine skeletons.

Here, we will briefly discuss the most important core classes that you will encounter in your day-to-day use of spine-phaser. Please consult the Spine Runtimes Guide for a detailed overview of the Spine Runtimes architecture, core classes, and API usage.

The TextureAtlas class stores the data loaded from an .atlas file and its corresponding .png image files.

The SkeletonData class stores the data loaded from a .json or .skel skeleton file. The skeleton data contains information about the bone hierarchy, slots, attachments, constraints, skins, and animations. A SkeletonData instance is usually loaded by also providing an Atlas from which it sources the images to be used by the skeleton it represents. It serves as a blueprint for creating Skeleton instances. Multiple skeletons can be instantiated from the same atlas and skeleton data, which then share the loaded data, minimizing both load times and memory consumption at runtime.

The Skeleton class stores an instance of a skeleton, created from a SkeletonData instance. A skeleton stores its current pose, that is the position of bones and the current configuration of slots, attachments, and active skin. The current pose can be computed by either manually modifying the bone transforms, or, more commonly, by applying animations via an AnimationState.

The AnimationState class is responsible for keeping track of which animation(s) should be applied to a skeleton, advancing and mixing those animations based on the elapsed time between the last and current rendering frame, and applying the animations to a skeleton instance, thereby setting its current pose. The AnimationState queries an AnimationStateData instance to retrieve mixing times between animations, or fetches the default mix time if no mixing time is available for a pair of animations.

The spine-phaser runtime builds on top of these core classes.

Spine Scene Plugin
The spine-phaser scene plugin adds functionality to (pre-)load exported .json, .skel, and .atlas files to a scene's LoaderPlugin (Scene.load). It provides getters to access the raw skeleton data and texture atlases.

The scene plugin extends the scene's GameObjectFactory (Scene.add) and GameObjectCreator (Scene.make) with functions to create SpineGameObject instances from loaded skeleton data and atlas files.

Loading Spine Assets
Spine assets, like skeleton data .json/.skel files, or .atlas files, are loaded through additional functions added to the LoaderPlugin (Scene.load) of a Phaser Scene by the SpinePlugin.

spineBinary(key: string, url: string, xhrSettings: Phaser.Loader.XHRSettingsObject): loads a binary skeleton .skel file from the url and makes it available via the key. The XHRSettingsObject is optional.
spineJson(key: string, url: string, xhrSettings: Phaser.Loader.XHRSettingsObject): loads a JSON skeleton .json file from the url and makes it available via the key. The XHRSettingsObject is optional.
spineAtlas(key: string, url: string, premultipliedAlpha: boolean, xhrSettings: Phaser.Loader.XHRSettingsObject): loads texture atlas .atlas file and its related .png texture atlas page files from the url and makes it available via the key. The premultipliedAlpha parameter is optional and specifies if the atlas was exported with premultiplied-alpha enabled. By default, the value stored in the .atlas file is used. The XHRSettingsObject is optional.
Assuming you have exported your skeleton data to a binary skeleton file called skeleton.skel, and your atlas to a file called skeleton.atlas with one corresponding skeleton.png file, you can load your assets in your scene's preload() function like this:

function preload() {
 this.load.spineBinary("skeleton-data", "path/to/skeleton.skel");
 this.load.spineAtlas("skeleton-atlas", "path/to/skeleton.atlas");
}
The preload() function loads the SkeletonData from the skeleton.skel file and caches it under the key skeleton-data. It also loads the TextureAtlas from the skeleton.atlas file, as well as a texture from the corresponding skeleton.png file. The atlas is cached under the key skeleton-atlas. The individual texture atlas page images are loaded transparently without the need for explicitly loading them.

Once preloading has finished, you can access the TextureAtlas via Scene.spine.getAtlas(atlasKey). Similarly, you can access the raw SkeletonData via Scene.spine.getSkeletonData(dataKey, atlasKey). Note the second parameter: a SkeletonData instance can only be created in combination with an atlas for that skeleton data.

The skeleton data and atlas on their own can not be animated or rendered. Instead, a SpineGameObject is constructed from them. SpineGameObject instances can share the same skeleton data and atlas.

Creating SpineGameObject instances
Once skeleton data and a corresponding atlas have been loaded, a SpineGameObject can be created and optionally be added to the current scene via the spine() functions added to the scene's GameObjectFactory (Scene.add) and GameObjectCreator (Scene.make) by the SpinePlugin. You can use them in your scene's create() function:

function create() {
 // Create a SpineGameObject through the GameObjectFactory and add it to the scene
 const spineObject = this.add.spine(400, 500, "skeleton-data", "skeleton-atlas");

 // Create a SpineGameObject through the GameObjectCreator. It is not automatically
 // added to the scene.
 const spineObject2 = this.make.spine({
    x: 200, y: 500,
    dataKey: "skeleton-data", atlasKey: "skeleton-atlas"
 });

 // Manually add the game object to the scene
 this.add.existing(spineObject2);
}
The spine() function on the GameObjectFactory takes the objects position, the key of the skeleton data, and the key of the atlas as a parameter. This function will automatically add the object to the scene.

The spine() function on the GameObjectCreator takes a SpineGameObjectConfig as a parameter, which also specifies the position, data key, and atlas key. This function will not automatically add the object to the scene.

By default, a SpineGameObject is sized based on its setup pose bounding box. This behaviour can be customized by passing an optional SpineGameObjectBoundsProvider parameter to either of the spine() functions.

A bounds provider calculates the size of the bounding box of a Spine game object. By default, a SetupPoseBoundsProvider is used, which calculates the bounding box based on the bounds of the skeleton in its setup pose.

Another bounds provider is the SkinsAndAnimationBoundsProvider, which calculates the bounding box based on the maximum bounding box for a given set of skins and animation.

You can also pass a custom bounds provider to the spine() functions by implementing the SpineGameObjectBoundsProvider interface.

SpineGameObject
A SpineGameObject is a Phaser GameObject that bundles storing, updating, and rendering a Skeleton and its associated AnimationState. SpineGameObject instances are created from a skeleton data and an atlas, as described in the last section. The Skeleton and AnimationState are accessible through the skeleton and animationState fields respectively.

Every frame, the SpineGameObject will:

Update the AnimationState
Apply the AnimationState to the Skeleton
Update the Skeleton world transforms, resulting in a new pose
Render the Skeleton in its current pose
Applying Animations
Applying animations to a skeleton displayed by a SpineGameObject is done through the AnimationState.

Note: See Applying Animations in the Spine Runtimes Guide for more in-depth information, specifically about animation tracks and animation queueing.

To set a specific animation on track 0, call AnimationState.setAnimation():

spineObject.animationState.setAnimation(0, "walk", true);
The first parameter specifies the track, the second parameter is the name of the animation, and the third parameter defines whether to loop the animation.

You can queue multiple animations:

spineObject.animationState.setAnimation(0, "walk", true);
spineObject.animationState.addAnimation(0, "jump", 2, false);
spineObject.animationState.addAnimation(0, "run", 0, true);
The first parameter to addAnimation() is the track. The second parameter is the name of the animation. The third parameter specifies the delay in seconds, after which this animation should replace the previous animation on the track. The final parameter defines whether to loop the animation.

In the example above, the "walk" animation is played back first. 2 seconds later, the "jump" animation is played back once, followed by a transition to the "run" animation, which will be looped.

When transitioning from one animation to another, AnimationState will mix the animations for a specific duration called mix time. These mix times are defined in an AnimationStateData instance, from which the AnimationState retrieves mix times.

The AnimationStateData instance is also available through the SpineGameObject. You can set the default mix time, or the mix time for a specific pair of animations:

spineObject.animationStateData.setDefaultMix = 0.2;
spineObject.animationStateData.setMix("walk", "jump", 0.1);
When setting or adding an animation, a TrackEntry object is returned, which allows further modification of that animation's playback. For example, you can set the track entry to reverse the animation playback:

const entry = spineObject.animationState.setAnimation(0, "walk", true);
entry.reverse = true;
See the TrackEntry class documentation for more options.

Note: Be careful about holding on to TrackEntry instances outside the function you are using them in. Track entries are re-used internally and will thus become invalid once the track entry dispose event occurs.

You can set or queue empty animations on an animation track to smoothly reset the skeleton back to its setup pose:

spineObject.animationState.setEmptyAnimation(0, 0.5);
spineObject.animationState.addEmptyAnimation(0, 0.5, 0.5);
The first parameter to setEmptyAnimation() specifies the track. The second parameter specifies the mix duration in seconds used to mix out the previous animation and mix in the "empty" animation.

The first parameter to addEmptyAnimation() specifies the track. The second parameter specifies the mix duration. The third parameter is the delay in seconds, after which the empty animation should replace the previous animation on the track via mixing.

All animations on a track can be cleared immediately via AnimationState.clearTrack(). To clear all tracks at once, AnimationState.clearTracks() can be used. This will leave the skeleton in the last pose it was in.

To reset the pose of a skeleton to the setup pose, use Skeleton.setupPose():

spineObject.skeleton.setupPose();
This will reset both the bones and slots to their setup pose configuration. Use Skeleton.setupPoseSlots() to only reset the slots to their setup pose configuration.

AnimationState Events
An AnimationState emits events during the life-cycle of an animation that is being played back. You can listen for this events to react as needed. The Spine Runtimes API defines the following event types:

start: emitted when an animation is started.
interrupt: emitted when an animation's track was cleared, or a new animation was set.
end: emitted when an animation will never be applied again.
dispose: emitted when the animation's track entry is disposed.
complete: emitted when an animation completes a loop.
event: emitted when a user defined event happened.
To receive events, you can register an AnimationStateListener callback with either the AnimationState to receive events across all animations, or with the TrackEntry of a specific animation queued for playback:

spineObject.animationState.addListener({
   start: (entry) => log(`Started animation ${entry.animation.name}`),
   interrupt: (entry) => log(`Interrupted animation ${entry.animation.name}`),
   end: (entry) => log(`Ended animation ${entry.animation.name}`),
   dispose: (entry) => log(`Disposed animation ${entry.animation.name}`),
   complete: (entry) => log(`Completed animation ${entry.animation.name}`),
   event: (entry, event) => log(`Custom event for ${entry.animation.name}: ${event.data.name}`)
})

trackEntry.listener = {
   event: (entry, event) => log(`Custom event for ${entry.animation.name}: ${event.data.name}`)
}
See the events-example.html example.

Skins
Many applications and games allow users to create custom avatars out of many individual items, such as hair, eyes, pants, or accessories like earrings or bags. With Spine, this can be achived by mixing and matching skins.

You can create custom skins from other skins like this:

const skeletonData = spineObject.skeleton.data;
const skin = new spine.Skin("custom");
skin.addSkin(skeletonData.findSkin("skin-base"));
skin.addSkin(skeletonData.findSkin("nose/short"));
skin.addSkin(skeletonData.findSkin("eyelids/girly"));
skin.addSkin(skeletonData.findSkin("eyes/violet"));
skin.addSkin(skeletonData.findSkin("hair/brown"));
skin.addSkin(skeletonData.findSkin("clothes/hoodie-orange"));
skin.addSkin(skeletonData.findSkin("legs/pants-jeans"));
skin.addSkin(skeletonData.findSkin("accessories/bag"));
skin.addSkin(skeletonData.findSkin("accessories/hat-red-yellow"));
spineObject.skeleton.setSkin(skin);
spineObject.skeleton.setupPoseSlots();
Create a custom skin with the Skin() constructor.

Next, fetch the SkeletonData from the skeleton. It is used to look up skins by name via SkeletonData.findSkin().

Add all the skins you want to combine into the new custom skin via Skin.addSkin().

Finally, set the new skin on the Skeleton and call Skeleton.setupPoseSlots() to ensure no attachments from previous skins and/or animations are left over.

See mix-and-match-example.html for full example code.

Setting Bone Transforms
When authoring a skeleton in the Spine Editor, the skeleton is defined in what is called the skeleton's world coordinate system or "skeleton coordinate system". This coordinate system may not align with the coordinate system of Phaser. Mouse and touch coordinates relative to the SpineGameObject need thus be converted to the skeleton coordinate system, e.g. if a user should be able to move a bone by touch.

The SpineGameObject offers the method phaserWorldCoordinatesToBone(point: { x: number, y: number}, bone: Bone) which takes an a point relative to the SpineGameObject and converts it to the skeleton's coordinate system, relative to the specified bone.

The reverse, that is converting from the skeleton coordinate system to the Phaser coordinate system, can be achieved via SpineGameObject.skeletonToPhaserWorldCoordinates(point: { x: number, y: number}).

See control-bones-example.html for full example code.

Spine Runtimes API access
spine-phaser exposes the entire spine-ts core API via the SpineGameObject properties skeleton, animationStateData, and animationState. See the JS doc documentation of these classes as well as the generic Spine Runtimes Guide.

Differences to the Phaser Spine Plugin
Phaser offers its own Spine Plugin which is based on our spine-ts WebGL runtime. While writing our official spine-phaser runtime, we tried to stay as close to the API provided by Phaser. Here we discuss the few differences between the Phaser provided plugin and our official spine-phaser runtime API.

Starting with Spine 4.1, our spine-phaser runtime will be maintained like our other Spine Runtimes. This means you'll get timely updates whenever a new Spine Editor version is released, you will have access to beta runtimes for the next Spine Editor version, and you'll receive all the latest improvements and bug fixes in a timely manner. The Phaser maintainers may not be able to provide such guarantees, as the Spine Plugin is understandably not their number one priority.

On the API side, there are a handful of differences to watch out for.

Loading skeleton and atlas data
Loading a skeleton and its atlas with the Phaser Spine Plugin is a single step:

javascriptthis.load.spine('spineboy', 'spineboy.json`, [ `spineboy.atlas` ], true);
With the spine-phaser runtime, the atlas data and skeleton data are loaded separately.

this.load.spineBinary("spineboy-data", "spineboy.skel");
this.load.spineAtlas("spineboy-atlas", "spineboy.atlas");
This allows you to share the same atlas across different skeletons. The spine-phaser runtime also supports both loading JSON and binary skeleton data, whereas the Phaser Spine Plugin can only load JSON skeleton data. Finally, the loader methods will automatically deduce if a skeleton's atlas uses pre-multiplied alpha or not.

The spine-phaser skeleton data loader does not support loading multiple spine skeletons from a single JSON file while the Phaser Spine Plugin does.

Creating SpineGameObject instances
Creating a SpineGameObject with the Phaser Spine Plugin references only a single loaded asset, and offers many additional, optional parameters.

javascriptconst spineboy = this.add.spine(400, 600, 'spineboy', 'idle', true);
The spine-phaser runtime requires you to specify the keys of both the skeleton data and atlas.

javascriptconst spineboy = this.add.spine(400, 500, 'spineboy-data', "spineboy-atlas");
spineboy.animationState.setAnimation(0, "idle", true)
You can provide an optional SkeletonBoundsProvider as the 5th parameter as described above. However, you can not configure any other properties through this method. Instead, you directly access the methods and properties of the SpineGameObject to configure it to your liking.

Spine Container
The Phaser Spine Plugin features a special container class called SpineContainer. Its purpose is to batch the rendering of multiple SpineGameObject instances contained within it for better performance.

With the spine-phaser runtime, this is not necessary, as the renderer will automatically batch subsequent SpineGameObject instances if possible, irrespective of their container parent.

Examples ports
To further ease the transition from the Phaser Spine Plugin to our official spine-phaser runtime, we've ported most of the Phaser Spine Plugin examples to the spine-phaser runtime.