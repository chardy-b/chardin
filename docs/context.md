# Chardin context

This vocabulary is canonical for the Chardin runtime.

| Term              | Definition                                                                                        | Avoid                                         |
| ----------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Experience        | The browser lifecycle from capability check through running, paused, failed, and disposed states. | Calling only the page or renderer “the game.” |
| Planet            | The spherical world root defined by center, radius, terrain, and anchored landmarks.              | “Map” for the sphere.                         |
| Surface frame     | The local orthonormal `up`, `forward`, and `right` axes at a point on the Planet.                 | Assuming one fixed world-up axis.             |
| Actor             | A simulated entity positioned and oriented relative to a Surface frame.                           | Equating every Actor with the player.         |
| Traveler          | The player-controlled Actor and its simulation state.                                             | Coupling movement to visual model nodes.      |
| Character asset   | A replaceable visual presentation for a Traveler, eventually a GLB and animation contract.        | Calling model geometry the Traveler.          |
| Control intent    | Device-independent movement and action values for one simulation step.                            | Reading DOM events inside simulation code.    |
| Motor             | A pure movement state transition using Control intent, Planet geometry, and elapsed time.         | Including camera or rendering logic.          |
| Camera rig        | Camera state that follows the Traveler relative to the Planet.                                    | Fixed-world-up camera logic.                  |
| Landmark          | Authored content anchored by a position and tangent frame on the Planet.                          | Parenting landmarks to the Traveler.          |
| Skyspace          | A future original Landmark whose aperture and authored light sequence shape perception.           | Replicating a named artwork.                  |
| Rendering profile | Quality-controlled renderer and scene settings.                                                   | Scattered device checks.                      |
| Content manifest  | Typed declarations for replaceable authored content.                                              | Unstructured asset URLs in engine code.       |

The placeholder cone-and-icosahedron figure is a Character asset; its position and direction are Traveler state. The Planet is the sphere and its surface queries; a future pavilion attached in a local tangent frame will be a Landmark.
