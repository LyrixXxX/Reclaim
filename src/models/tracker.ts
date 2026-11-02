export type TrackerId = string;
export type TrackerMode = 'abstinence' | 'reduction' | 'habit';
export type FrequencyPeriod = 'day' | 'week' | 'month';
export type SavingsRate = { effectiveDate: string; amountCents: number; everyCount: number; everyUnit: FrequencyPeriod };
export type SavingsExpense = { id: string; label: string; rates: SavingsRate[]; endedOn?: string };
export type TaperStepStatus = 'planned' | 'current' | 'completed';
export type DatePrecision = 'exact' | 'approximate' | 'date_only' | 'unknown';

export type Tracker = {
  id: TrackerId;
  name: string;
  displayName?: string;
  icon: string;
  color: string;
  mode: TrackerMode;
  /** Original abstinence or reduction start; never repurposed for taper steps. */
  startedAt?: string;
  /** Reserved for a future taper step independently of the original reduction start. */
  currentStepStartedAt?: string;
  baseline?: number;
  current?: number;
  unit?: string;
  checkpointDays?: number[];
  target?: number;
  frequencyCount?: number;
  frequencyPeriod?: FrequencyPeriod;
  habitLogStyle?: 'done' | 'count';
  habitTemplate?: 'water' | 'walk' | 'sleep' | 'exercise' | 'produce' | 'reading' | 'mindfulness' | 'dental';
  habitGoalHistory?: { effectiveDate: string; value: number }[];
  mindfulnessVisualMode?: 'breathing' | 'quiet';
  exerciseGoalModes?: { effectiveDate: string; mode: 'times' | 'minutes' }[];
  exerciseRegimenHistory?: { effectiveDate: string; rows: { id: string; label: string; days: number[] }[] }[];
  producePresets?: number[];
  habitChecklistHistory?: { effectiveDate: string; items: { id: string; label: string }[] }[];
  waterQuickAddOz?: number;
  waterDisplayUnit?: 'fl oz' | 'mL';
  waterPresetOz?: number[];
  waterGoals?: { effectiveDate: string; ounces: number }[];
  habitReminderTime?: string;
  habitNotificationId?: string;
  notes?: string;
  savingsExpenses?: SavingsExpense[];
  archived?: boolean;
};

export type LapseEvent = {
  id: string;
  trackerId: TrackerId;
  date: string;
  note?: string;
  createdAt: string;
};

export type DayOutcome =
  | 'stayed_on_plan'
  | 'lapse'
  | 'partial'
  | 'no_data'
  | 'note_only';

export type HistoricalEntry = {
  id: string;
  trackerId: TrackerId;
  eventDate: string;
  recordedAt: string;
  outcome: DayOutcome;
  note?: string;
  value?: number;
};

export type WaterLog = { id: string; trackerId: TrackerId; eventDate: string; ounces: number; recordedAt: string };
export type GoodHabitLog = { id: string; trackerId: TrackerId; eventDate: string; amount: number; recordedAt: string; note?: string; durationMinutes?: number; checklistItemId?: string; nutritionEntryId?: string; nutritionEntryUpdatedAt?: string; workoutRowId?: string; workoutLabel?: string; produceCategory?: 'fruit' | 'vegetable'; source?: 'manual' | 'nutrition' };

export type TaperStep = {
  id: string;
  trackerId: TrackerId;
  amount: number;
  unit: string;
  startedAt?: string;
  endedAt?: string;
  status: TaperStepStatus;
  note?: string;
  datePrecision: DatePrecision;
  recordedAt: string;
};

export type HealthReading = {
  id: string;
  type: 'bloodPressure';
  systolic: number;
  diastolic: number;
  pulse: number;
  measuredAt: string;
  recordedAt: string;
  note?: string;
};

export type CpapReading = {
  id: string;
  sleepDate: string;
  usedMinutes: number;
  averagePressure: number;
  p95Pressure: number;
  ahi: number;
  cai: number;
  averageLeak: number;
  p95Leak: number;
  score?: number;
  photoUri?: string;
  recordedAt: string;
  note?: string;
};

export type CpapUsageGoal = { effectiveDate: string; minutes: number };

export type CpapTherapySettings = {
  id: string;
  /** Calendar date these settings began applying. */
  effectiveDate: string;
  /** Optional local 24-hour time. Omitted when only the date is known. */
  effectiveTime?: string;
  mode: 'APAP' | 'CPAP';
  minPressure: number;
  maxPressure: number;
  rampStartPressure?: number;
  rampMinutes?: number;
  exhalationRelief?: string;
  humidity?: string;
  heatedTubeTemperature?: string;
  maskName?: string;
  note?: string;
  recordedAt: string;
};

export type WeightEntry = {
  id: string;
  date: string;
  weight: number;
  unit: 'lb' | 'kg';
  caloriesEaten?: number | null;
  estimatedBurn?: number | null;
  goal?: number | null;
  notes?: string;
  recordedAt: string;
  source?: 'health-connect';
  sourceApp?: string;
};

export type WeightTdeeProfile = {
  heightCm: number;
  birthDate: string;
  formulaSex: 'male' | 'female';
};

export type CpapEquipment = {
  id: string;
  name: string;
  kind: 'machine' | 'mask';
  status: 'current' | 'upcoming' | 'retired';
  installedAt?: string;
};

export type CpapMaintenanceItem = {
  id: string;
  equipmentId?: string;
  label: string;
  category: 'clean' | 'inspect' | 'replace';
  intervalDays: number;
  lastCompletedAt?: string;
  enabled: boolean;
  guidance?: string;
};

export type CpapMaintenanceEvent = {
  id: string;
  itemId: string;
  completedAt: string;
};

export type AppSection = 'goals' | 'health' | 'cpap' | 'weight' | 'nutrition' | 'activity' | 'routes' | 'workouts' | 'supplements';
export type NavigationSection = 'activity' | 'routes' | 'goals' | 'weight' | 'nutrition' | 'workouts' | 'supplements';
export type HealthModule = 'bloodPressure' | 'medications' | 'labs';

export type AppPreferences = {
  dashboard?: DashboardWidget[];
  hiddenHomeHabitIds?: string[];
  homeGoalColors?: Record<string, string>;
  showQuittingTaperingOnHome?: boolean;
  showTrainingOverviewOnHome?: boolean;
  visibleSections: Record<Exclude<AppSection, 'workouts' | 'routes' | 'supplements'>, boolean> & { workouts?: boolean; routes?: boolean; supplements?: boolean };
  navigationOrder?: NavigationSection[];
  visibleHealthModules: Record<HealthModule, boolean>;
  includeRouteCaloriesInNutrition?: boolean;
  includeWorkoutCaloriesInNutrition?: boolean;
  includeSupplementNutrientsInNutrition?: boolean;
};

export type DashboardWidgetId = 'quickActions' | 'nutrition' | 'medications' | 'cpap' | 'weight' | 'bloodPressure' | 'labs' | 'habits' | 'activity';
export type ActivityPoint = { latitude: number; longitude: number; timestamp: number; accuracy?: number | null; altitudeMeters?: number | null; altitudeAccuracyMeters?: number | null; segment?: number };
export type ActivityTimeInterval = { startedAt: string; endedAt: string };
export type ActivityRoute = { id: string; kind: 'walk' | 'hike' | 'run' | 'route'; startedAt: string; endedAt: string; pausedMs: number; distanceMeters: number; points: ActivityPoint[]; movingMs?: number; stoppedMs?: number; unclassifiedMs?: number; manualPauseIntervals?: ActivityTimeInterval[]; stationaryIntervals?: ActivityTimeInterval[]; autoPauseIntervals?: ActivityTimeInterval[]; estimateWeightKg?: number; estimatedCalories?: number; routeSteps?: number; routeStepStatus?: 'available' | 'unavailable' | 'partial'; name?: string; notes?: string };
export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'arms' | 'quadriceps' | 'hamstrings' | 'glutes' | 'calves' | 'legs' | 'core' | 'traps' | 'forearms' | 'full body';
export type ExerciseEquipment = 'machine' | 'barbell' | 'dumbbell' | 'cable' | 'bodyweight' | 'other';
export type ExerciseMeasurement = 'weighted_reps' | 'bodyweight_reps' | 'assisted_reps' | 'timed_hold' | 'distance_carry';
export type StrengthExercise = { id: string; name: string; primaryMuscle: MuscleGroup; secondaryMuscles: MuscleGroup[]; equipment: ExerciseEquipment; measurementType?: ExerciseMeasurement; aliases?: string[]; notes?: string; custom?: boolean };
export type StrengthSet = { id: string; kind: 'warmup' | 'working' | 'drop' | 'failure'; weightKg?: number; assistanceKg?: number; holdSeconds?: number; distanceMeters?: number; reps: number; notes?: string; completedAt: string; startedAt?: string; durationMs?: number };
export type WorkoutExercise = { id: string; exerciseId: string; name: string; primaryMuscle: MuscleGroup; secondaryMuscles?: MuscleGroup[]; equipment: ExerciseEquipment; measurementType?: ExerciseMeasurement; plannedSets?: number; targetReps?: number; targetWeightKg?: number; restSeconds?: number; notes?: string; sets: StrengthSet[] };
export type WorkoutRoutine = { id: string; name: string; exercises: WorkoutExercise[]; weekdays?: number[]; notes?: string; createdAt: string; updatedAt: string };
export type ActualOneRepMax = { id: string; exerciseId: string; weightKg: number; date: string; notes?: string; context?: string; sourceSetId?: string };
export type WorkoutSetDraft = { weight: string; reps: string; notes: string; kind: StrengthSet['kind']; unit: 'lb' | 'kg'; autoSuggested?: boolean };
export type WorkoutTimingMode = 'smart' | 'timed' | 'simple';
export type WorkoutSettings = { timingMode: WorkoutTimingMode; restSeconds: number; exerciseRestSeconds: Record<string, number>; haptics: boolean; restNotifications: boolean; weightUnit: 'lb' | 'kg'; showCalories: boolean };
export type WorkoutCalories = { source: 'estimated' | 'manual'; type: 'active' | 'gross'; kcal: number; activeKcal: number; intensity?: 'light' | 'moderate' | 'vigorous'; estimateWeightKg?: number };
export type WorkoutSession = { id: string; name: string; routineId?: string; startedAt: string; endedAt?: string; pausedAt?: string; pausedMs: number; exercises: WorkoutExercise[]; currentExerciseId?: string; setStartedAt?: string; setExerciseId?: string; restStartedAt?: string; restEndsAt?: string; restPausedMs?: number; restNotificationId?: string; calories?: WorkoutCalories; notes?: string; setDrafts?: Record<string, WorkoutSetDraft> };
export type StepDay = { date: string; count: number; incomplete: boolean };
export type StepGoal = { effectiveDate: string; count: number };
export type DashboardWidget = {
  id: DashboardWidgetId;
  visible: boolean;
  expanded: boolean;
  /** Undefined means all eligible items; [] means no selected items. */
  selectedIds?: string[];
};

export type MedicationSchedule = {
  type: 'daily' | 'weekly' | 'interval' | 'as_needed';
  times: string[];
  weekdays?: number[];
  intervalHours?: number;
};

export type Medication = {
  id: string;
  kind?: 'medication' | 'supplement';
  name: string;
  discreetName?: string;
  strength?: string;
  /** Structured quantity for newly created supplements; legacy free-text strength remains intact. */
  dosagePerUnit?: number;
  dosageUnit?: string;
  defaultUnitsTaken?: number;
  nutrientProfile?: NutrientAmount[];
  form?: string;
  instructions?: string;
  startedAt?: string;
  endedAt?: string;
  prescriber?: string;
  notes?: string;
  schedule: MedicationSchedule;
  remindersEnabled: boolean;
  reminderMode?: 'normal' | 'audible';
  reminderSound?: boolean;
  reminderVibration?: boolean;
  notificationIds: string[];
  archived: boolean;
  recordedAt: string;
};

export type MedicationEvent = {
  id: string;
  medicationId: string;
  scheduledFor?: string;
  occurredAt: string;
  correctedAt?: string;
  outcome: 'taken' | 'skipped' | 'snoozed';
  unitsTaken?: number;
  /** Canonical totals captured when Take is confirmed, never recalculated from the current product. */
  nutrientSnapshot?: Record<string, number>;
  note?: string;
};

export type SupplementStack = {
  id: string;
  name: string;
  members: { medicationId: string; time: string }[];
};

export type LabResult = {
  id: string;
  /** Stable parent identity. Legacy records are migrated from marker names. */
  labTrackerId?: string;
  panelDate: string;
  resultTime?: string;
  sourceTimezone?: string;
  marker: string;
  value: number;
  unit: string;
  referenceRange?: string;
  flag?: string;
  note?: string;
  photoUri?: string;
  recordedAt: string;
};

export type LabTracker = {
  id: string;
  name: string;
  defaultUnit?: string;
  notes?: string;
  createdAt: string;
};

export type NutritionNutrients = {
  carbsGrams: number;
  proteinGrams: number;
  fatGrams: number;
  fiberGrams: number;
  /** Explicitly recorded canonical amounts. An absent key means unknown, not zero. */
  extraNutrients?: Record<string, number>;
};

export type NutrientAmount = { nutrientId: string; amount: number; unit: string };
export type CustomNutrient = { id: string; name: string; unit: string };
export type NutrientSelection = { nutrientId: string; state: 'goal' | 'tracked'; goalType?: 'minimum' | 'maximum' | 'target'; goalAmount?: number; order: number; legacyFiberGoal?: boolean; color?: string; visible?: boolean };

export type NutritionGoalProfile = NutritionNutrients & {
  id: string;
  effectiveDate: string;
  recordedAt: string;
  /** Older profiles derive this from macro grams. */
  calorieTarget?: number;
  macroTargetsEnabled?: boolean;
  fitnessGoal?: 'fat-loss' | 'muscle-gain' | 'maintenance';
  macroMethod?: 'manual' | 'calculated';
  calculation?: { sourceWeightLb: number; referenceWeightLb: number; heightCm: number };
};

export type NutritionMealGroup = {
  id: string;
  name: string;
  sortOrder: number;
  builtIn: boolean;
  archived: boolean;
};

export type NutritionSource = 'manual' | 'ai_text' | 'ai_label' | 'saved_food' | 'saved_meal';

export type SavedFood = {
  id: string;
  name: string;
  brand?: string;
  servingLabel: string;
  /** Reference weight printed for one labeled serving. */
  servingWeightGrams?: number;
  nutrients: NutritionNutrients;
  statedCalories?: number;
  labelPhotoUri?: string;
  source: NutritionSource;
  createdAt: string;
  updatedAt: string;
};

export type SavedMealItem = {
  id: string;
  foodId?: string;
  name: string;
  brand?: string;
  servingLabel: string;
  servings: number;
  amountMode: 'servings' | 'weight';
  consumedAmount?: number;
  consumedUnit?: 'g' | 'oz';
  servingWeightGrams?: number;
  nutrients: NutritionNutrients;
  statedCalories?: number;
};

export type SavedMeal = {
  id: string;
  name: string;
  note?: string;
  items: SavedMealItem[];
  createdAt: string;
  updatedAt: string;
};

export type NutritionEntry = {
  id: string;
  eventDate: string;
  eatenAt?: string;
  recordedAt: string;
  updatedAt: string;
  mealGroupId: string;
  mealLabel: string;
  foodId?: string;
  name: string;
  brand?: string;
  servingLabel: string;
  servings: number;
  /** How the consumed amount was entered. Legacy entries default to servings. */
  amountMode?: 'servings' | 'weight';
  /** Original amount typed by the user when logging by weight. */
  consumedAmount?: number;
  consumedUnit?: 'g' | 'oz';
  /** Reference weight used to calculate the serving multiplier. */
  servingWeightGrams?: number;
  nutrients: NutritionNutrients;
  statedCalories?: number;
  source: NutritionSource;
  note?: string;
  /** Shared metadata used to visually group foods logged from one saved meal. */
  savedMealId?: string;
  savedMealName?: string;
  savedMealInstanceId?: string;
};

export type TrackerState = {
  trackers: Tracker[];
  checkIns: string[];
  /** Missing on older installations and backups means setup was already complete. */
  onboardingStatus?: 'pending' | 'complete';
  onboardingSelections?: OnboardingArea[];
  onboardingSetupDraft?: {
    weight?: { value: string; unit: 'lb' | 'kg'; skipped?: boolean };
    nutrition?: { calories?: string; carbs: string; protein: string; fat: string; fiber: string; skipped?: boolean };
    activity?: { stepGoal: string; enableStepTracking: boolean; skipped?: boolean };
  };
  lapseEvents?: LapseEvent[];
  historicalEntries?: HistoricalEntry[];
  taperSteps?: TaperStep[];
  /** Additive, backward-compatible local health log. */
  healthReadings?: HealthReading[];
  /** Additive, backward-compatible local CPAP log. */
  cpapReadings?: CpapReading[];
  cpapUsageGoals?: CpapUsageGoal[];
  /** Date-effective device settings kept separately from machine readings. */
  cpapTherapySettings?: CpapTherapySettings[];
  /** Additive, backward-compatible local weight log. */
  weightEntries?: WeightEntry[];
  weightTdeeProfile?: WeightTdeeProfile;
  cpapEquipment?: CpapEquipment[];
  cpapMaintenanceItems?: CpapMaintenanceItem[];
  cpapMaintenanceEvents?: CpapMaintenanceEvent[];
  preferences?: AppPreferences;
  medications?: Medication[];
  medicationEvents?: MedicationEvent[];
  supplementStacks?: SupplementStack[];
  medicationScheduleVersion?: number;
  medicationReminderVersion?: number;
  labTrackers?: LabTracker[];
  labTrackerVersion?: number;
  labResults?: LabResult[];
  nutritionGoals?: NutritionGoalProfile[];
  macroUpdateDismissedWeightLb?: number;
  nutrientSelections?: NutrientSelection[];
  customNutrients?: CustomNutrient[];
  nutritionMealGroups?: NutritionMealGroup[];
  savedFoods?: SavedFood[];
  savedMeals?: SavedMeal[];
  nutritionEntries?: NutritionEntry[];
  activityRoutes?: ActivityRoute[];
  stepHistory?: StepDay[];
  stepGoals?: StepGoal[];
  waterLogs?: WaterLog[];
  goodHabitLogs?: GoodHabitLog[];
  strengthExercises?: StrengthExercise[];
  workoutRoutines?: WorkoutRoutine[];
  workoutSessions?: WorkoutSession[];
  actualOneRepMaxes?: ActualOneRepMax[];
  activeWorkout?: WorkoutSession;
  workoutSettings?: WorkoutSettings;
};

export type OnboardingArea = 'habits' | 'nutrition' | 'cpap' | 'weight' | 'activity' | 'routes' | 'workouts' | 'supplements' | 'bloodPressure' | 'medications' | 'labs';
