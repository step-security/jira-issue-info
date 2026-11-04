import * as core from "@actions/core";
import * as fs from "fs";
import { ActionInputs, CustomField } from "./types";
import { getInputs, getLoginData } from "./config";
import { sendRequest } from "./request";
import axios, { AxiosResponse, isAxiosError } from "axios";

async function validateSubscription() {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    let repoPrivate: boolean | undefined;

    if (eventPath && fs.existsSync(eventPath)) {
        const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
        repoPrivate = eventData?.repository?.private;
    }

    const upstream = "frieder/jira-issue-info";
    const action = process.env.GITHUB_ACTION_REPOSITORY;
    const docsUrl = "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

    core.info("");
    core.info("\u001b[1;36mStepSecurity Maintained Action\u001b[0m");
    core.info(`Secure drop-in replacement for ${upstream}`);
    if (repoPrivate === false) core.info("\u001b[32m\u2713 Free for public repositories\u001b[0m");
    core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
    core.info("");

    if (repoPrivate === false) return;

    const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
    const body: Record<string, string> = { action: action || "" };
    if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;
    try {
        await axios.post(
            `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
            body,
            { timeout: 3000 }
        );
    } catch (error) {
        if (isAxiosError(error) && error.response?.status === 403) {
            core.error(
                `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
            );
            core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
            process.exit(1);
        }
        core.info("Timeout or API not reachable. Continuing to next step.");
    }
}

(async function () {
    await validateSubscription();
    const login = getLoginData();
    const inputs = getInputs();
    const response: AxiosResponse = await sendRequest(login, inputs);
    _setOutput(response.data, inputs);
    core.info(`Data for Jira issue [${inputs.issue}] received.`);
})().catch((err) => {
    core.setFailed("Unexpected error occurred in action: " + err.message);
});

function _setOutput(json: any, inputs: ActionInputs) {
    core.setOutput("issue", json.key);
    core.setOutput("summary", json.fields.summary);
    core.setOutput("description", json.fields.description?.content[0]?.content[0]?.text);
    core.setOutput("type", json.fields.issuetype?.name);
    core.setOutput("typeID", json.fields.issuetype?.id);
    core.setOutput("status", json.fields.status?.name);
    core.setOutput("statusID", json.fields.status?.id);
    core.setOutput("priority", json.fields.priority?.name);
    core.setOutput("priorityID", json.fields.priority?.id);
    core.setOutput("resolution", json.fields.resolution);
    core.setOutput("labels", json.fields.labels?.join(","));
    core.setOutput("reporter", json.fields.reporter?.displayName);
    core.setOutput("reporterID", json.fields.reporter?.accountId);
    core.setOutput("assignee", json.fields.assignee?.displayName);
    core.setOutput("assigneeID", json.fields.assignee?.accountId);
    core.setOutput("components", json.fields.components?.map((c: any) => c.name).join(","));

    _addCustomFieldsToOutput(json, inputs.customFields);

    core.setOutput("json", JSON.stringify(json));
}

function _addCustomFieldsToOutput(json: any, fields: CustomField[]) {
    if (fields.length === 0) return;

    fields.forEach((field) => {
        const fieldName = "customfield_" + field.id;
        const value = json.fields[fieldName];

        if (value === null) {
            core.setOutput(field.outputID, "");
        } else if (typeof value === "string") {
            core.setOutput(field.outputID, value);
        } else if (typeof value === "object") {
            core.setOutput(field.outputID, value.value);
        }
    });
}
