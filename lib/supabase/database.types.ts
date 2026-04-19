export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      statements: {
        Row: {
          account_last4: string | null
          account_name: string | null
          bank: string | null
          created_at: string
          currency: string
          id: string
          period_end: string
          period_start: string
          source_file_name: string
          source_file_sha256: string
          statement_type: Database["public"]["Enums"]["statement_type"]
          status: Database["public"]["Enums"]["statement_status"]
          timezone: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          account_last4?: string | null
          account_name?: string | null
          bank?: string | null
          created_at?: string
          currency?: string
          id?: string
          period_end: string
          period_start: string
          source_file_name: string
          source_file_sha256: string
          statement_type: Database["public"]["Enums"]["statement_type"]
          status?: Database["public"]["Enums"]["statement_status"]
          timezone?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          account_last4?: string | null
          account_name?: string | null
          bank?: string | null
          created_at?: string
          currency?: string
          id?: string
          period_end?: string
          period_start?: string
          source_file_name?: string
          source_file_sha256?: string
          statement_type?: Database["public"]["Enums"]["statement_type"]
          status?: Database["public"]["Enums"]["statement_status"]
          timezone?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_imports: {
        Row: {
          ai_model_version: string | null
          ai_suggested_at: string | null
          ai_suggestion_status: string
          amount: number
          balance: number | null
          created_at: string
          date: string
          description: string
          exclusion_reason: string | null
          existing_transaction_id: string | null
          id: string
          is_excluded: boolean | null
          line_number: number | null
          month_bucket: string
          notes: string | null
          resolution: Database["public"]["Enums"]["import_resolution"]
          statement_id: string
          statement_page: number | null
          suggested_tag_ids: string[]
          transaction_identifier: string
          updated_at: string
        }
        Insert: {
          ai_model_version?: string | null
          ai_suggested_at?: string | null
          ai_suggestion_status?: string
          amount: number
          balance?: number | null
          created_at?: string
          date: string
          description: string
          exclusion_reason?: string | null
          existing_transaction_id?: string | null
          id?: string
          is_excluded?: boolean | null
          line_number?: number | null
          month_bucket: string
          notes?: string | null
          resolution?: Database["public"]["Enums"]["import_resolution"]
          statement_id: string
          statement_page?: number | null
          suggested_tag_ids?: string[]
          transaction_identifier: string
          updated_at?: string
        }
        Update: {
          ai_model_version?: string | null
          ai_suggested_at?: string | null
          ai_suggestion_status?: string
          amount?: number
          balance?: number | null
          created_at?: string
          date?: string
          description?: string
          exclusion_reason?: string | null
          existing_transaction_id?: string | null
          id?: string
          is_excluded?: boolean | null
          line_number?: number | null
          month_bucket?: string
          notes?: string | null
          resolution?: Database["public"]["Enums"]["import_resolution"]
          statement_id?: string
          statement_page?: number | null
          suggested_tag_ids?: string[]
          transaction_identifier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_imports_existing_transaction_id_fkey"
            columns: ["existing_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_imports_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_tags: {
        Row: {
          created_at: string
          is_primary: boolean
          tag_id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          tag_id: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          tag_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          balance: number | null
          created_at: string
          date: string
          description: string
          exclusion_reason: string | null
          id: string
          is_excluded: boolean
          line_number: number | null
          month_bucket: string
          statement_id: string
          statement_page: number | null
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_identifier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          balance?: number | null
          created_at?: string
          date: string
          description: string
          exclusion_reason?: string | null
          id?: string
          is_excluded?: boolean
          line_number?: number | null
          month_bucket: string
          statement_id: string
          statement_page?: number | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_identifier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          balance?: number | null
          created_at?: string
          date?: string
          description?: string
          exclusion_reason?: string | null
          id?: string
          is_excluded?: boolean
          line_number?: number | null
          month_bucket?: string
          statement_id?: string
          statement_page?: number | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_identifier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          ai_budget_reset_at: string
          ai_monthly_budget_cents: number
          ai_spent_this_month_cents: number
          auto_tag_enabled: boolean
          created_at: string
          currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_budget_reset_at?: string
          ai_monthly_budget_cents?: number
          ai_spent_this_month_cents?: number
          auto_tag_enabled?: boolean
          created_at?: string
          currency?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_budget_reset_at?: string
          ai_monthly_budget_cents?: number
          ai_spent_this_month_cents?: number
          auto_tag_enabled?: boolean
          created_at?: string
          currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      import_resolution: "pending" | "accepted" | "rejected"
      statement_status: "parsed" | "ingesting" | "ingested" | "failed"
      statement_type: "bank" | "credit_card"
      transaction_status: "active" | "voided"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      import_resolution: ["pending", "accepted", "rejected"],
      statement_status: ["parsed", "ingesting", "ingested", "failed"],
      statement_type: ["bank", "credit_card"],
      transaction_status: ["active", "voided"],
    },
  },
} as const


// Helper types for easier usage
export type Statement = Database['public']['Tables']['statements']['Row']
export type StatementInsert = Database['public']['Tables']['statements']['Insert']
export type StatementUpdate = Database['public']['Tables']['statements']['Update']

export type Transaction = Database['public']['Tables']['transactions']['Row']
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert']
export type TransactionUpdate = Database['public']['Tables']['transactions']['Update']

export type TransactionImport = Database['public']['Tables']['transaction_imports']['Row']
export type TransactionImportInsert = Database['public']['Tables']['transaction_imports']['Insert']
export type TransactionImportUpdate = Database['public']['Tables']['transaction_imports']['Update']

export type StatementType = Database['public']['Enums']['statement_type']
export type StatementStatus = Database['public']['Enums']['statement_status']
export type ImportResolution = Database['public']['Enums']['import_resolution']
export type TransactionStatus = Database['public']['Enums']['transaction_status']

export type Tag = Database['public']['Tables']['tags']['Row']
export type TagInsert = Database['public']['Tables']['tags']['Insert']
export type TagUpdate = Database['public']['Tables']['tags']['Update']

export type TransactionTag = Database['public']['Tables']['transaction_tags']['Row']
export type TransactionTagInsert = Database['public']['Tables']['transaction_tags']['Insert']
