Questions I need answered before I can write a real plan                   
                                                                                                                                                                                                                                                       
  I'll ask these one batch at a time. The answers to these change the plan dramatically — guessing here is the kind of thing that produces a "too simple" plan or a wrong plan.
                                                                                                                                                                                                                                                       
  Q1 — Household model. How should "partner B's statements feed the same view" actually work? Three real options:                                                                                                                                      
                                                                                                                                                                                                                                                       
  - (a) Single account, multiple statements — you upload all 4 PDFs under one login. No partner concept in DB; just account_owner text on each statement. Simplest. Loses "per person" reports unless we tag owner.                                    
  - (b) Household with linked users — new households + household_members tables. Each user logs in separately, statements attribute to a member, RLS scopes to household. Most correct. Biggest lift.
  - (c) Single account with member field on statement/transaction — you log in alone, but tag each upload as "Partner A" / "Partner B" / "Joint". Gets you per-person reports without auth/sharing complexity.                                         

  ANSWER: Lets do C for now. B needs to happen but KIV for now. Lets focus on delivering value. Especially for my wife.
                                                                                                                                                                                                                        
  Which matches how you and your partner would actually use this?                                                                                                                                                                                      
                                                                                                                                                                                                                                                       
  Q2 — Privacy posture for stored data. Right now statements keeps account_name, account_last4, source_file_name, bank. How aggressive do you want to be?                                                                                              
                                                                             
  - (a) Strip at ingest — never persist account_name or original filename. Keep only bank (e.g., "DBS"), account_last4 (last 4 only), statement_type.                                                                                                  
  - (b) Encrypt at rest — keep them but encrypt with a per-user key.         
  - (c) Status quo — keep verbatim, rely on RLS only.                       

                                                                                                                                                                                                                           
  I'd recommend (a) unless you have a reason to keep originals.                                                                                                                                                                                        
    
  ANSWER: A. Although Im not 100% sure what this Privacy posture covers. Is it just the file names?                                                                                                                                                                            
                                                                                                                                                                                                                                                                                    
  Q3 — Locale awareness for embeddings. Pick the cheapest thing that works:                                                                                                                                                                            
                                                                             
  - (a) Prepend country to embedding text — e.g. embed "SG: NTUC FAIRPRICE 234" instead of "NTUC FAIRPRICE 234". Free. Already half-done via country-code expansion.                                                                                   
  - (b) Curated merchant dictionary per country — lib/locale/sg.json with { "NTUC": "grocery", "KOPITIAM": "food court", ... }. Enriches the embedding text and provides hard rules. ~50–200 entries per country, gets you 80% of value.
  - (c) Hybrid — (a) by default, (b) layered when present.                                                                                                                                                                                             
                                                                                                                                                                                                                                                       
  Recommend (c). Are you okay with hand-curating a starter SG dictionary?                                       
  ANSWER: Lets do C. But we build this by letting the user do the tagging themselves. Make it smarter for them. Not sure if this should be a colletive thing or no.                                                                                                                                       
                                                                                                                                                                                                                                                       
  Q4 — Rebuild or evolve. You said "not sure whether to do a full rebuild yet." My honest read: don't rebuild. The pipeline (lib/pdf, lib/db/ingest, lib/suggest) is the hard, expensive part and it works. What needs to change is mostly schema      
  additions (household / member / metadata), a normalization layer (locale dict + merchant canonical), and insights queries (group-by member). All additive. Agreed, or do you have a reason to suspect the foundation is wrong?
  ANSWER: I think the current setup do not follow the KISS strictly. Maybe it's also the thought that this is not private enough for us to be free of liability. The latter seems to be the most accurate feeling why I was contemplating on rebuilding, but you're right. It's already working. We should just improve further.

  Q5 — Auto-detect transfers / CC payments. Step 4 ("exclude non-spend") today is fully manual. Want me to include heuristic auto-detection in the plan? Cheap signals: same-user transactions where amount matches across statements within ±2 days;  
  descriptions like "PAYMENT TO CREDIT CARD", "TRANSFER", "GIRO". Auto-flag, user confirms.
  ANSWER: I like the check across statements. Gives the user more reason why they should upload all statements in one go.

  