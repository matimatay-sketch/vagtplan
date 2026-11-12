
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "agreement": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_example": boolean,"key": string,"kind": Database["public"]['Enums']["agreement_kind"],"name": string,"organization_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_example"?: boolean,"key": string,"kind": Database["public"]['Enums']["agreement_kind"],"name": string,"organization_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_example"?: boolean,"key"?: string,"kind"?: Database["public"]['Enums']["agreement_kind"],"name"?: string,"organization_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agreement_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"agreement_version": {
                  Row: {
                    "agreement_id": string,"created_at": string,"document": NonNullable<Json>,"id": string,"published_at": string | null,"published_by": string | null,"status": Database["public"]['Enums']["agreement_version_status"],"valid_from": string,"valid_to": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"created_at"?: string,"document": NonNullable<Json>,"id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: Database["public"]['Enums']["agreement_version_status"],"valid_from": string,"valid_to"?: string | null,"version": number
                  }
                  Update: {
                    "agreement_id"?: string,"created_at"?: string,"document"?: NonNullable<Json>,"id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: Database["public"]['Enums']["agreement_version_status"],"valid_from"?: string,"valid_to"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agreement_version_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "agreement"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"created_at": string,"id": number,"organization_id": string | null,"row_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: never,"organization_id"?: string | null,"row_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: never,"organization_id"?: string | null,"row_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"contract": {
                  Row: {
                    "agreement_id": string,"created_at": string,"employee_id": string,"exempt_from_registration": boolean,"exemption_reason": string | null,"exemption_since": string | null,"id": string,"local_agreement_id": string | null,"organization_id": string,"overrides": NonNullable<Json>,"pay_form": Database["public"]['Enums']["pay_form"],"pay_period_group_id": string,"pay_step": string | null,"seniority_date": string | null,"staff_group": string | null,"valid_from": string,"valid_to": string | null,"weekly_norm_minutes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"created_at"?: string,"employee_id": string,"exempt_from_registration"?: boolean,"exemption_reason"?: string | null,"exemption_since"?: string | null,"id"?: string,"local_agreement_id"?: string | null,"organization_id": string,"overrides"?: NonNullable<Json>,"pay_form": Database["public"]['Enums']["pay_form"],"pay_period_group_id": string,"pay_step"?: string | null,"seniority_date"?: string | null,"staff_group"?: string | null,"valid_from": string,"valid_to"?: string | null,"weekly_norm_minutes": number
                  }
                  Update: {
                    "agreement_id"?: string,"created_at"?: string,"employee_id"?: string,"exempt_from_registration"?: boolean,"exemption_reason"?: string | null,"exemption_since"?: string | null,"id"?: string,"local_agreement_id"?: string | null,"organization_id"?: string,"overrides"?: NonNullable<Json>,"pay_form"?: Database["public"]['Enums']["pay_form"],"pay_period_group_id"?: string,"pay_step"?: string | null,"seniority_date"?: string | null,"staff_group"?: string | null,"valid_from"?: string,"valid_to"?: string | null,"weekly_norm_minutes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "agreement"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_local_agreement_id_fkey"
      columns: ["local_agreement_id"]
isOneToOne: false
      referencedRelation: "agreement"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "contract_organization_id_pay_period_group_id_fkey"
      columns: ["organization_id","pay_period_group_id"]
isOneToOne: false
      referencedRelation: "pay_period_group"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"department": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name": string,"organization_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "department_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"department_manager": {
                  Row: {
                    "created_at": string,"department_id": string,"organization_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department_id": string,"organization_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string,"organization_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "department_manager_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"employee": {
                  Row: {
                    "archived_at": string | null,"birth_date": string,"created_at": string,"email": string | null,"employee_number": string,"first_name": string,"hired_on": string | null,"id": string,"last_name": string,"organization_id": string,"phone": string | null,"school_obligated": boolean,"school_obligation_ends_on": string | null,"terminated_on": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"birth_date": string,"created_at"?: string,"email"?: string | null,"employee_number": string,"first_name": string,"hired_on"?: string | null,"id"?: string,"last_name": string,"organization_id": string,"phone"?: string | null,"school_obligated"?: boolean,"school_obligation_ends_on"?: string | null,"terminated_on"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"birth_date"?: string,"created_at"?: string,"email"?: string | null,"employee_number"?: string,"first_name"?: string,"hired_on"?: string | null,"id"?: string,"last_name"?: string,"organization_id"?: string,"phone"?: string | null,"school_obligated"?: boolean,"school_obligation_ends_on"?: string | null,"terminated_on"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_department": {
                  Row: {
                    "created_at": string,"department_id": string,"employee_id": string,"is_primary": boolean,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department_id": string,"employee_id": string,"is_primary"?: boolean,"organization_id": string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string,"employee_id"?: string,"is_primary"?: boolean,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_department_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "employee_department_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"membership": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"organization": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"timezone"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pay_period_group": {
                  Row: {
                    "anchor_date": string | null,"archived_at": string | null,"created_at": string,"frequency": Database["public"]['Enums']["pay_frequency"],"id": string,"month_start_day": number | null,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_date"?: string | null,"archived_at"?: string | null,"created_at"?: string,"frequency": Database["public"]['Enums']["pay_frequency"],"id"?: string,"month_start_day"?: number | null,"name": string,"organization_id": string
                  }
                  Update: {
                    "anchor_date"?: string | null,"archived_at"?: string | null,"created_at"?: string,"frequency"?: Database["public"]['Enums']["pay_frequency"],"id"?: string,"month_start_day"?: number | null,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_period_group_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_employee":
{ Args: { "p_birth_date": string,"p_department_id": string,"p_email"?: string,"p_employee_number": string,"p_first_name": string,"p_hired_on"?: string,"p_last_name": string,"p_phone"?: string,"p_school_obligated"?: boolean,"p_school_obligation_ends_on"?: string }; Returns: string
                           },
"create_organization":
{ Args: { "org_name": string }; Returns: string
                           }
          }
          Enums: {
            "agreement_kind": "base"|"agreement"|"local","agreement_version_status": "draft"|"published"|"archived","app_role": "admin"|"manager"|"employee","pay_form": "hourly"|"monthly","pay_frequency": "weekly"|"biweekly"|"monthly"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "agreement_kind": ["base", "agreement", "local"],"agreement_version_status": ["draft", "published", "archived"],"app_role": ["admin", "manager", "employee"],"pay_form": ["hourly", "monthly"],"pay_frequency": ["weekly", "biweekly", "monthly"]
          }
        }
} as const
