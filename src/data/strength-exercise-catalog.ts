import { ExerciseEquipment, ExerciseMeasurement, MuscleGroup, StrengthExercise } from '@/models/tracker';

type CatalogRow = [MuscleGroup, ExerciseEquipment, string, ExerciseMeasurement?];
const rows: CatalogRow[] = [];
function add(muscle: MuscleGroup, equipment: ExerciseEquipment, names: string, measurement?: ExerciseMeasurement) {
  for (const name of names.split('|')) rows.push([muscle, equipment, name, measurement]);
}

add('chest', 'machine', 'Seated Chest Press Machine|Supine Chest Press Machine|Incline Chest Press Machine|Decline Chest Press Machine|Pec Deck / Chest Fly Machine|Plate-Loaded Chest Press|Plate-Loaded Incline Press|Smith Machine Bench Press|Smith Machine Incline Bench Press');
add('chest', 'barbell', 'Barbell Bench Press|Incline Barbell Bench Press|Decline Barbell Bench Press');
add('chest', 'dumbbell', 'Dumbbell Bench Press|Incline Dumbbell Bench Press|Dumbbell Chest Fly');
add('chest', 'cable', 'Cable Chest Fly|Incline Cable Chest Fly');
add('chest', 'bodyweight', 'Push-Up|Chest Dip', 'bodyweight_reps');

add('back', 'machine', 'Lat Pulldown Machine|Assisted Pull-Up Machine|Seated Row Machine|Chest-Supported Row Machine|High Row Machine|Iso-Lateral Row Machine|Plate-Loaded Row Machine|Pullover Machine|Back Extension Machine');
add('back', 'cable', 'Wide-Grip Lat Pulldown|Close-Grip Lat Pulldown|Reverse-Grip Lat Pulldown|Seated Cable Row|Straight-Arm Cable Pulldown|Single-Arm Cable Row');
add('back', 'barbell', 'Barbell Bent-Over Row|T-Bar Row|Landmine Row');
add('back', 'dumbbell', 'Dumbbell Row|Chest-Supported Dumbbell Row');
add('back', 'bodyweight', 'Pull-Up|Chin-Up|Back Extension', 'bodyweight_reps');

add('shoulders', 'machine', 'Seated Shoulder Press Machine|Plate-Loaded Shoulder Press|Lateral Raise Machine|Reverse Pec Deck|Smith Machine Shoulder Press');
add('shoulders', 'barbell', 'Barbell Overhead Press|Barbell Shrug');
add('shoulders', 'dumbbell', 'Seated Dumbbell Shoulder Press|Standing Dumbbell Shoulder Press|Arnold Press|Dumbbell Lateral Raise|Dumbbell Front Raise|Dumbbell Rear Delt Fly|Dumbbell Shrug');
add('shoulders', 'cable', 'Cable Lateral Raise|Cable Front Raise|Cable Rear Delt Fly|Face Pull|Cable Upright Row');

add('biceps', 'machine', 'Biceps Curl Machine|Preacher Curl Machine');
add('biceps', 'barbell', 'Barbell Curl|EZ-Bar Curl|Preacher Curl');
add('biceps', 'dumbbell', 'Dumbbell Curl|Alternating Dumbbell Curl|Hammer Curl|Incline Dumbbell Curl|Concentration Curl');
add('biceps', 'cable', 'Cable Biceps Curl|Rope Hammer Curl|Single-Arm Cable Curl');

add('triceps', 'machine', 'Triceps Extension Machine|Seated Dip Machine|Assisted Dip Machine');
add('triceps', 'cable', 'Cable Triceps Pushdown|Rope Triceps Pushdown|Reverse-Grip Triceps Pushdown|Overhead Cable Triceps Extension|Single-Arm Cable Triceps Extension');
add('triceps', 'barbell', 'Skull Crusher|Close-Grip Bench Press');
add('triceps', 'dumbbell', 'Dumbbell Overhead Triceps Extension');
add('triceps', 'bodyweight', 'Bench Dip|Diamond Push-Up', 'bodyweight_reps');

add('quadriceps', 'machine', '45-Degree Leg Press|Horizontal Leg Press|Seated Leg Press|Hack Squat Machine|Pendulum Squat Machine|Leg Extension Machine|Smith Machine Squat');
add('quadriceps', 'barbell', 'Barbell Back Squat|Barbell Front Squat');
add('quadriceps', 'dumbbell', 'Goblet Squat|Bulgarian Split Squat|Walking Lunge');

add('hamstrings', 'machine', 'Seated Leg Curl Machine|Lying Leg Curl Machine|Standing Leg Curl Machine');
add('hamstrings', 'barbell', 'Romanian Deadlift|Stiff-Leg Deadlift|Good Morning');
add('hamstrings', 'dumbbell', 'Dumbbell Romanian Deadlift');
add('hamstrings', 'bodyweight', 'Nordic Hamstring Curl|Glute-Ham Raise', 'bodyweight_reps');

add('glutes', 'machine', 'Hip Thrust Machine|Glute Kickback Machine|Hip Abduction Machine|Glute Drive Machine');
add('glutes', 'barbell', 'Barbell Hip Thrust');
add('glutes', 'dumbbell', 'Dumbbell Hip Thrust|Step-Up');
add('glutes', 'bodyweight', 'Glute Bridge', 'bodyweight_reps');
add('glutes', 'cable', 'Cable Glute Kickback|Cable Pull-Through');

add('calves', 'machine', 'Seated Calf Raise Machine|Standing Calf Raise Machine|Leg Press Calf Raise|Donkey Calf Raise Machine|Smith Machine Calf Raise');
add('calves', 'dumbbell', 'Standing Dumbbell Calf Raise');
add('calves', 'bodyweight', 'Single-Leg Calf Raise', 'bodyweight_reps');

add('core', 'machine', 'Abdominal Crunch Machine|Rotary Torso Machine|Ab Coaster Machine');
add('core', 'cable', 'Cable Crunch|Cable Woodchop|Pallof Press');
add('core', 'bodyweight', 'Crunch|Reverse Crunch|Hanging Knee Raise|Hanging Leg Raise|Captain\'s Chair Knee Raise|Plank|Side Plank|Ab Wheel Rollout', 'bodyweight_reps');

add('traps', 'machine', 'Smith Machine Shrug');
add('traps', 'barbell', 'Trap Bar Shrug');
add('traps', 'dumbbell', 'Farmer\'s Carry', 'distance_carry');
add('forearms', 'dumbbell', 'Dumbbell Wrist Curl|Reverse Wrist Curl');
add('forearms', 'barbell', 'Reverse Barbell Curl|Wrist Roller');
add('forearms', 'bodyweight', 'Dead Hang', 'timed_hold');
add('forearms', 'other', 'Plate Pinch Hold', 'timed_hold');

add('full body', 'barbell', 'Conventional Deadlift|Sumo Deadlift|Trap Bar Deadlift|Clean and Press|Power Clean|Barbell Thruster');
add('full body', 'dumbbell', 'Dumbbell Thruster|Turkish Get-Up');
add('full body', 'other', 'Kettlebell Swing');

const specialMeasurements: Record<string, ExerciseMeasurement> = {
  'Assisted Pull-Up Machine': 'assisted_reps', 'Assisted Dip Machine': 'assisted_reps',
  Plank: 'timed_hold', 'Side Plank': 'timed_hold', 'Pallof Press': 'timed_hold',
};
const aliases: Record<string, string[]> = {
  'Barbell Bench Press': ['bench', 'bench press', 'chest press'],
  'Seated Chest Press Machine': ['chest press', 'machine chest press'],
  'Supine Chest Press Machine': ['chest press'],
  'Incline Chest Press Machine': ['chest press'],
  'Decline Chest Press Machine': ['chest press'],
  'Romanian Deadlift': ['rdl'],
  'Dumbbell Romanian Deadlift': ['dumbbell rdl'],
  'Cable Triceps Pushdown': ['tri pushdown', 'tricep pushdown'],
  'Rope Triceps Pushdown': ['tri pushdown', 'rope pushdown'],
  'Reverse-Grip Triceps Pushdown': ['tri pushdown'],
  'Conventional Deadlift': ['deadlift'],
};
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Explicitly namespaced IDs stay stable even if catalog order changes. */
export const EXPANDED_STRENGTH_CATALOG: StrengthExercise[] = rows.map(([primaryMuscle, equipment, name, measurement]) => ({
  id: `builtin-v2-${slug(name)}`, name, primaryMuscle, secondaryMuscles: [], equipment,
  measurementType: specialMeasurements[name] ?? measurement ?? 'weighted_reps', aliases: aliases[name] ?? [], custom: false,
}));
