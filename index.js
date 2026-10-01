import {pkg} from "@slack/bolt"
const {App}=pkg;
import {WebClient} from "@slack/web-api"
import {ChatOpenAI} from "@langchain/openai"
import {ChatPromptTemplate} from "@langchain/core/prompts"
import express from "express";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const log = {
    info: (msg,...args)=> console.log(`[INFO] : ${msg}`,...args),
    error: (msg,...args)=> console.log(`[ERROR] : ${msg}`,...args),
    debug: (msg,...args)=> process.env.NODE_ENV==="development"&&console.log(`[DEBUG] : ${msg}`,...args),
}

class SlackAIAgent{
    constructor()
    {
        this.app= express();
        this.slack= new App({
            token: process.env.SLACK_BOT_TOKEN,
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            socketMode: true,
            appToken:process.env.SLACK_APP_TOKEN
        });
        this.WebClient= new WebClient(process.env.SLACK_BOT_TOKEN);
        this.openai= new ChatOpenAI({
            model:"gpt-4",
            temperature: 0.3,
            apiKey: process.env.OPENAI_API_KEY
        })
        this.setupSlackEvents();
        this.setupExpress();
    }

         setupSlackEvents(){
        this.slack.event('team_join',async({event})=>{
            try{
                log.info(`New member joined: ${event.user.real_name}||${event.user.name}`);
                const userInfo= await this.getUserInfo(event.user.id);
                await this.analyzeAndPostMember(userInfo);
            }
            catch(err)
            {
                log.error('Error processing team_join:',err.message);
            }
        });

        this.slack.event('member_joined_channel',async ({event})=>{
            try{
                if(event.channel_type==='C'){
                    log.info(`member ${event.user} joined channel ${event.channel}`);
                    const userInfo= this.getUserInfo(even.user);
                    await this.analyzeAndPostMember(userInfo);
                }
            }
            catch(err)
            {
                log.error('Error Processing member_joined_channel:',err.message);
            }
        });

        this.slack.error(async (error)=> log.error('Slack error',error.message));
    }

    setupExpress()
    {
        this.app.use(express.json());
        this.app.get('/health',(req,res)=>{
            res.json({status : healthy, timestamp: new Date().toISOString()});  
        })
        if(process.env.NODE_ENV==='development')
            {
                this.app.post('/test/analyzi-member',async(req,res)=>{
                    try{

                        const {memberInfo}= req.body;
                        if(!memberInfo) return res.status(400).json({error :'member info is required.'});
                        const analysis = this.analyzeAndPostMember(memberInfo);
                        res.json({success:true, analysis,timestamp: new Date().toISOString()});
                    }catch(error)
                    {
                        log.error('Test Analysis error: ',error.message);
                        res.status(500).json({error:'Analysis Failed',message:error.message});
                    }
                })
            }
            this.app.use((err,req,res,next)=>{
                log.error('ExpressError',err.message);
                res.status(500).json({error:'Internal Server Error'});
            }) 
    }

    async getUserInfo(userId) {
        const result = await this.webClient.users.info({ user: userId });
        const user = result.user;

        return {
            id: user.id,
            name: user.real_name || user.name,
            username: user.name,
            email: user.profile?.email,
            title: user.profile?.title,
            timezone: user.tz,
            profile: {
                firstName: user.profile?.first_name,
                lastName: user.profile?.last_name,
                statusText: user.profile?.status_text
            }
        };
    }

    async analyzeAndPostMember(memberInfo)
    {
        let analysisId=null;
        try{
             log.info(`processing member: ${memberInfo.name}`);
             const researchData= await this.doBasicResearch(memberInfo);
             const analysis= await this.analyzeWithAI(memberInfo,researchData);
             log.info(`Saving analysis to DB for ${memberInfo.name}`);
             analysisId= await saveMemberAnalysis(memberInfo,analysis,researchData);
             await this.postAnalysisToChannel(memberInfo,analysis,researchData);

             if(analysisID)
                await markAsSentToSlack(analysisID);
        }
        catch(err)
        {
            log.error(`error processing ${memberInfo.name}:`,error.message);
            if(analysisId!=null)
            {
                log.info(`Analysis ${analysisId} saved to Database but not sent to slack due to error`);
            }
            throw error;
        }
    }
}